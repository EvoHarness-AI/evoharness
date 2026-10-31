#!/usr/bin/env node
/**
 * Release script for evoharness-mono
 *
 * Usage:
 *   node scripts/release.mjs <major|minor|patch|x.y.z> [--offline] [--dry-run] [--skip-tests]
 *
 * Flags:
 *   --offline     Skip the two steps that need a released project: the npm registration check
 *                 and pinning/building with the newest evoharness.dev model catalog. The build
 *                 is still verified with the committed model data.
 *   --dry-run     Print every step and the version/tag it would create without touching the
 *                 worktree. Use it to confirm a release before running it for real.
 *   --skip-tests  Skip ./test.sh (checks and the package-install check still run).
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Verify every public workspace package is registered on npm (`--offline` skips),
 *    pin the newest model catalog for Nix, and build with it (`--offline` builds as-is)
 * 3. Bump version via npm run version:xxx or set an explicit version
 * 4. Update CHANGELOG.md files: [Unreleased] -> [version] - date
 * 5. Regenerate release artifacts
 * 6. Run checks and tests
 * 7. Commit and tag the release
 * 8. Add new [Unreleased] section to changelogs
 * 9. Commit next-cycle changelog updates
 * 10. Push main and the tag to trigger CI publication
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findPackageDirectories } from "./package-workspaces.mjs";
import { getPublicWorkspacePackages } from "./release-packages.mjs";
import { hydrateModelCatalogBytes, updateModelCatalogPin } from "./update-model-catalog-pin.mjs";

const KNOWN_FLAGS = new Set(["--offline", "--dry-run", "--skip-tests"]);
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((argument) => argument.startsWith("--")));
const positional = argv.filter((argument) => !argument.startsWith("--"));
const unknownFlags = [...flags].filter((flag) => !KNOWN_FLAGS.has(flag));
const OFFLINE = flags.has("--offline");
const DRY_RUN = flags.has("--dry-run");
const SKIP_TESTS = flags.has("--skip-tests");
// A dry run must not depend on a published project either, otherwise the printout would not match
// what --offline does.
const LOCAL_MODE = OFFLINE || DRY_RUN;

if (unknownFlags.length > 0) {
	console.error(`Unknown flag(s): ${unknownFlags.join(", ")}`);
	process.exit(1);
}

if (positional.length > 1) {
	console.error(`Expected one version argument, got ${positional.length}: ${positional.join(" ")}`);
	process.exit(1);
}

const RELEASE_TARGET = positional[0];
const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

if (!RELEASE_TARGET || (!BUMP_TYPES.has(RELEASE_TARGET) && !SEMVER_RE.test(RELEASE_TARGET))) {
	console.error("Usage: node scripts/release.mjs <major|minor|patch|x.y.z> [--offline] [--dry-run] [--skip-tests]");
	process.exit(1);
}

function run(cmd, options = {}) {
	if (DRY_RUN) {
		console.log(`[dry-run] $ ${cmd}`);
		return "";
	}
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch (e) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

function getVersion() {
	const pkg = JSON.parse(readFileSync("packages/ai/package.json", "utf-8"));
	return pkg.version;
}

function assertPackagesAreRegisteredWithNpm() {
	const packageNames = getPublicWorkspacePackages().map((pkg) => pkg.name);
	const unregisteredPackages = [];

	console.log("Checking npm package registration...");
	for (const packageName of packageNames) {
		const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["view", packageName, "version", "--json"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		if (result.status === 0 && result.stdout.trim()) {
			console.log(`  ${packageName}`);
			continue;
		}

		const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
		if (output.includes("E404") || output.includes("404 Not Found")) {
			unregisteredPackages.push(packageName);
			continue;
		}

		throw new Error(output ? `Failed to query npm registration for ${packageName}\n${output}` : `Failed to query npm registration for ${packageName}`);
	}

	if (unregisteredPackages.length > 0) {
		throw new Error(`The following public workspace packages are not registered on npm:\n${unregisteredPackages.map((packageName) => `  ${packageName}`).join("\n")}\nRegister them before running a release.`);
	}

	console.log("  All public workspace packages are registered on npm\n");
}

const MODEL_CATALOG_PIN = "nix/model-catalog.json";

// Release tags are immutable, so the tagged Nix pin must already build the
// release. Pin the newest catalog unconditionally (`--if-stale` only avoids pin
// churn on main), then run the Nix build's steps: hydrate the checkout's model
// data from it and build offline. This catches e.g. source that references a
// model the catalog lacks. On failure, restore the committed pin so the
// worktree is clean for a rerun.
async function pinAndBuildWithNewestModelCatalog() {
	const root = process.cwd();
	const committedPin = readFileSync(MODEL_CATALOG_PIN, "utf8");
	const restored = `${MODEL_CATALOG_PIN} was restored. Run \`npm run generate:models\` to restore local model data, then rerun the release.`;
	let revision;
	let result;
	try {
		const pin = await updateModelCatalogPin(root);
		revision = pin.revision;
		console.log(`  Pinned model catalog ${revision}`);
		hydrateModelCatalogBytes(root, pin.bytes);
		console.log("$ npm run build:offline");
		const npm = process.platform === "win32" ? "npm.cmd" : "npm";
		result = spawnSync(npm, ["run", "build:offline"], { stdio: "inherit" });
	} finally {
		if (result?.status !== 0) writeFileSync(MODEL_CATALOG_PIN, committedPin);
	}
	// Only a build that ran and exited non-zero says anything about the catalog.
	if (result.error || result.signal) {
		const cause = result.error ? result.error.message : `it was stopped by ${result.signal}`;
		console.error(`Error: npm run build:offline did not complete: ${cause}.\n${restored}`);
		process.exit(1);
	}
	if (result.status !== 0) {
		console.error(
			`Error: the build with the newest published model catalog ${revision} failed; the Nix build of the release tag would fail too.\n` +
				"If the errors concern model IDs, types, or APIs, the catalog predates main: publish one from main (Publish Model Catalog workflow).\n" +
				"Otherwise fix the build (e.g. run `npm ci --ignore-scripts` if node_modules is out of date).\n" +
				restored,
		);
		process.exit(1);
	}
}

function compareVersions(a, b) {
	const aParts = a.split(".").map(Number);
	const bParts = b.split(".").map(Number);

	for (let i = 0; i < 3; i++) {
		const diff = (aParts[i] || 0) - (bParts[i] || 0);
		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function removeStaleWorkspaceLockEntries() {
	const workspaceVersions = new Map(
		getPublicWorkspacePackages().map((pkg) => [pkg.name, pkg.version]),
	);
	const lockPath = "package-lock.json";
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	let removed = 0;

	for (const [path, pkg] of Object.entries(lock.packages)) {
		if (!path.startsWith("packages/") || pkg.link === true) {
			continue;
		}
		for (const [name, version] of workspaceVersions) {
			if (path.endsWith(`/node_modules/${name}`) && pkg.version !== version) {
				delete lock.packages[path];
				removed++;
				break;
			}
		}
	}

	if (removed > 0) {
		if (!DRY_RUN) writeFileSync(lockPath, `${JSON.stringify(lock, null, "\t")}\n`);
		console.log(`Removed ${removed} stale workspace package lock ${removed === 1 ? "entry" : "entries"}.`);
	}
}

function stageChangedFiles() {
	const output = run("git ls-files -m -o -d --exclude-standard", { silent: true });
	const paths = [...new Set((output || "").split("\n").map((line) => line.trim()).filter(Boolean))];
	if (paths.length === 0) {
		return;
	}

	run(`git add -- ${paths.map(shellQuote).join(" ")}`);
}

function nextVersion(currentVersion, target) {
	const [major, minor, patch] = currentVersion.split(".").map(Number);
	if (target === "major") return `${major + 1}.0.0`;
	if (target === "minor") return `${major}.${minor + 1}.0`;
	if (target === "patch") return `${major}.${minor}.${patch + 1}`;
	return target;
}

function bumpOrSetVersion(target) {
	const currentVersion = getVersion();

	if (!BUMP_TYPES.has(target) && compareVersions(target, currentVersion) <= 0) {
		console.error(`Error: explicit version ${target} must be greater than current version ${currentVersion}.`);
		process.exit(1);
	}

	if (DRY_RUN) {
		const next = nextVersion(currentVersion, target);
		console.log(`[dry-run] would bump ${currentVersion} -> ${next}`);
		console.log(`[dry-run] $ npm version ${next} --workspaces --no-workspaces-update --no-git-tag-version`);
		console.log("[dry-run] $ node scripts/sync-versions.js");
		console.log("[dry-run] $ npm install --package-lock-only --ignore-scripts");
		return next;
	}

	if (BUMP_TYPES.has(target)) {
		console.log(`Bumping version (${target})...`);
		run(`npm run version:${target}`);
	} else {
		console.log(`Setting explicit version (${target})...`);
		run(`npm version ${target} --workspaces --no-git-tag-version --no-workspaces-update && node scripts/sync-versions.js && npm install --package-lock-only --ignore-scripts`);
	}

	// npm version can temporarily install the previous workspace versions before
	// sync-versions updates inter-package ranges. Remove those stale lock entries,
	// refresh the lockfile, then hydrate from the final dependency graph.
	removeStaleWorkspaceLockEntries();
	run("npm install --package-lock-only --ignore-scripts");
	run("npm ci --ignore-scripts");
	return getVersion();
}

function getChangelogs() {
	return findPackageDirectories()
		.map((directory) => join(directory, "CHANGELOG.md"))
		.filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.log(`  Skipping ${changelog}: no [Unreleased] section`);
			continue;
		}
		
		if (!DRY_RUN) {
			const updated = content.replace(
				"## [Unreleased]",
				`## [${version}] - ${date}`
			);
			writeFileSync(changelog, updated);
		}
		console.log(`  Updated ${changelog}`);
	}
}

function addUnreleasedSection() {
	const changelogs = getChangelogs();
	const unreleasedSection = "## [Unreleased]\n\n";

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		// Insert after "# Changelog\n\n"
		if (!DRY_RUN) {
			const updated = content.replace(
				/^(# Changelog\n\n)/,
				`$1${unreleasedSection}`
			);
			writeFileSync(changelog, updated);
		}
		console.log(`  Added [Unreleased] to ${changelog}`);
	}
}

// Main flow
console.log("\n=== Release Script ===\n");

// 1. Check for uncommitted changes
console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
if (status && status.trim()) {
	console.error("Error: Uncommitted changes detected. Commit or stash first.");
	console.error(status);
	process.exit(1);
}
console.log("  Working directory clean\n");

// 2. Verify npm package registration before modifying the worktree.
if (LOCAL_MODE) {
	console.log("Skipping the npm registration check (--offline)\n");
} else {
	assertPackagesAreRegisteredWithNpm();
}

// Pin and verify the Nix model catalog before modifying versions, so the pin
// lands in the release commit and a failure leaves the worktree clean.
if (LOCAL_MODE) {
	console.log("Building with the committed model data (--offline)...");
	run("npm run build:offline");
} else {
	console.log("Pinning and building with the newest model catalog for Nix...");
	await pinAndBuildWithNewestModelCatalog();
}
console.log();

// 3. Bump or set version
const version = bumpOrSetVersion(RELEASE_TARGET);
console.log(`  New version: ${version}\n`);

// 4. Update changelogs
console.log("Updating CHANGELOG.md files...");
updateChangelogsForRelease(version);
console.log();

// 5. Regenerate release artifacts
console.log("Regenerating release artifacts...");
if (!LOCAL_MODE) run("npm run generate:models");
run("npm run check:model-data");
run("npm run install-lock:coding-agent");
console.log();

// 6. Run checks and tests
console.log("Running checks...");
run("npm run check");
console.log();

console.log("Building packages for tests...");
run("npm run build:offline");
console.log();

// EVOHARNESS_RELEASE_SKIP_TESTS=1 skips the test suite, e.g. when it already passed in `npm run release:local`
// and an overloaded machine makes timing-sensitive tests fail. Checks and the install check still run.
if (SKIP_TESTS) process.env.EVOHARNESS_RELEASE_SKIP_TESTS = "1";
if (process.env.EVOHARNESS_RELEASE_SKIP_TESTS === "1") {
	console.log("Skipping tests (--skip-tests or EVOHARNESS_RELEASE_SKIP_TESTS=1)\n");
} else if (process.platform === "win32") {
	if (DRY_RUN) {
		console.log("[dry-run] ./test.sh would be skipped: it is a bash script and this platform is win32\n");
	} else {
		console.error("./test.sh is a bash script; on Windows run the release with --skip-tests after the suite passed in CI.\n");
		process.exit(1);
	}
} else {
	console.log("Running tests...");
	run("./test.sh");
	console.log();
}

console.log("Checking the packed coding-agent consumer install...");
run("npm run check:package-install");
console.log();

// 7. Commit and tag
console.log("Committing and tagging...");
stageChangedFiles();
// A release always changes package-lock.json, which the pre-commit guard only allows with this flag.
run(`git commit -m "Release v${version}"`, { env: { ...process.env, EVOHARNESS_ALLOW_LOCKFILE_CHANGE: "1" } });
run(`git tag -a v${version} -m "Release v${version}"`);
console.log();

// 8. Add new [Unreleased] sections
console.log("Adding [Unreleased] sections for next cycle...");
addUnreleasedSection();
console.log();

// 9. Commit
console.log("Committing changelog updates...");
stageChangedFiles();
run(`git commit -m "Add [Unreleased] section for next cycle"`);
console.log();

// 10. Push
console.log("Pushing to remote...");
run("git push origin main");
run(`git push origin v${version}`);
console.log();

console.log(`=== Prepared release v${version}; CI publication starts after the tag push ===`);
