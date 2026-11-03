#!/usr/bin/env node
/**
 * `docs/structure.md` §5.1 says a `cap-*` package depends on `@evoharness/capability`, §8 says no cap
 * reaches `durable` directly, §7 says the contract lands before the first capability, and §11 says a
 * capability's permissions are written as `permissions[]` rather than waved through in code. Until
 * this guard existed all four were prose, and the failure they describe is invisible: a tool that
 * never declares its ceiling still registers, still runs, and policy is left guessing what it may
 * touch.
 *
 * Five rules, each kept to what the tree can actually prove:
 *
 *   1. `@evoharness/capability` depends on no workspace package. The contract describes effects; if
 *      it imported upward into the kernel or a capability it would stop being the thing they are
 *      checked against.
 *   2. `cap-*` and `feature-*` may not depend on `@evoharness/durable`. Storage goes through
 *      `runtime-kit` (§8), and durable still contains the dormant second kernel.
 *   3. `cap-*` depends on `@evoharness/capability`, so its descriptor is checked at registration.
 *   4. Every built-in tool declares its ceiling. Names come from `allToolNames` in
 *      `packages/coding-agent/src/core/tools/index.ts`; the file that states each name must also
 *      state `permissions:`. Built-ins are what policy rules are written against, so an undeclared
 *      one is a hole rather than migration debt.
 *   5. Sites that register without declaring are recorded in `scripts/capability-permissions.baseline.json`
 *      and may only shrink, exactly like `check:file-size`. Undeclared is legal downstream (it means
 *      *unknown*, which policy reads as its strictest case), but the count must not creep upward.
 *      A baseline entry whose file has gone is stale and fails, so the ledger cannot rot.
 *
 * Left for later, on purpose:
 *   - call validateCapability() on each `packages/cap-<name>/src/capability.ts` once the first cap
 *     exists, so a descriptor cannot overstate or understate its own tools. The function and its
 *     tests already live in @evoharness/capability (roadmap item 1 carry-over).
 *   - forbid `cap-*` importing another `cap-*` (docs/structure.md §1 principle 3, KERNEL.md §2).
 *     Nothing does it today; a rule with no subject is a guess at someone else's shape.
 *
 * Rules 2 and 3 are vacuous today because no `cap-*` package exists yet; they are here so the first
 * one is born inside the boundary. A page of empty headings passes this guard and should fail its
 * review: whether a declaration is *true* is a human call, and no grep can make that decision.
 *
 * Usage:
 *   node scripts/check-capability-boundaries.mjs                        # verify (read-only)
 *   node scripts/check-capability-boundaries.mjs --write                # shrink/prune the ledger
 *   node scripts/check-capability-boundaries.mjs --write --allow-grow   # deliberate growth, owner call
 * Exit 1 with one line per violation.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { findPackageDirectories } from "./package-workspaces.mjs";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT ? resolve(process.env.EVOHARNESS_CHECK_ROOT) : process.cwd();
const CAPABILITY = "@evoharness/capability";
const DURABLE = "@evoharness/durable";
const WORKSPACE_PREFIX = "@evoharness/";
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const BASELINE_PATH = "scripts/capability-permissions.baseline.json";
const TOOLS_DIRECTORY = join("packages", "coding-agent", "src", "core", "tools");
const TOOLS_INDEX = join(TOOLS_DIRECTORY, "index.ts");
const REGISTRATION_CALL = ".registerTool(";
const DECLARATION_FIELD = "permissions:";
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "coverage"]);

const failures = [];
const write = process.argv.includes("--write");
const allowGrow = process.argv.includes("--allow-grow");

/** Repository-relative posix path, so the ledger reads the same on every platform. */
function keyOf(absolute) {
	return relative(ROOT, absolute).split(sep).join("/");
}

function walk(directory, out = []) {
	if (!existsSync(directory)) return out;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
			walk(path, out);
			continue;
		}
		if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name) && !/\.generated\.[cm]?[jt]sx?$/u.test(entry.name)) {
			out.push(path);
		}
	}
	return out;
}

function readText(path) {
	return readFileSync(path, "utf8");
}

function occurrences(text, needle) {
	let count = 0;
	let from = 0;
	for (;;) {
		const found = text.indexOf(needle, from);
		if (found === -1) return count;
		count += 1;
		from = found + needle.length;
	}
}

/** Names the session treats as built-in, read from the `allToolNames` set in the tools barrel. */
function builtInToolNames() {
	if (!existsSync(join(ROOT, TOOLS_INDEX))) return [];
	const source = readText(join(ROOT, TOOLS_INDEX));
	const start = source.indexOf("allToolNames");
	if (start === -1) return [];
	const end = source.indexOf("])", start);
	if (end === -1) return [];
	const names = [];
	for (const line of source.slice(start, end).split("\n")) {
		const quoted = line.match(/"([^"]+)"/gu);
		if (!quoted) continue;
		for (const entry of quoted) {
			const name = entry.slice(1, -1);
			if (name !== "Set" && !names.includes(name)) names.push(name);
		}
	}
	return names;
}

/** Files under `core/tools/`, which is where a built-in's ceiling has to be stated. */
function builtInSources() {
	return walk(join(ROOT, TOOLS_DIRECTORY)).filter((path) => statSync(path).isFile());
}

function readBaseline() {
	if (!existsSync(join(ROOT, BASELINE_PATH))) return {};
	const value = JSON.parse(readText(join(ROOT, BASELINE_PATH)));
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		console.error(`${BASELINE_PATH} must be an object of path -> recorded undeclared count`);
		process.exit(1);
	}
	return value;
}

/** Every file that registers a tool without declaring a ceiling in the same file. */
function undeclaredRegistrations() {
	const found = new Map();
	for (const directory of findPackageDirectories(join(ROOT, "packages"))) {
		for (const file of walk(directory)) {
			const text = readText(file);
			const registrations = occurrences(text, REGISTRATION_CALL);
			if (registrations === 0) continue;
			if (text.includes(DECLARATION_FIELD)) continue;
			found.set(keyOf(file), registrations);
		}
	}
	return found;
}

// Rules 1-3: manifests.
let checkedPackages = 0;
for (const directory of findPackageDirectories(join(ROOT, "packages"))) {
	const manifest = JSON.parse(readText(join(directory, "package.json")));
	const name = manifest.name;
	if (!name) continue;
	checkedPackages += 1;
	const shortName = name.startsWith(WORKSPACE_PREFIX) ? name.slice(WORKSPACE_PREFIX.length) : name;
	const dependencies = new Set();
	for (const section of DEPENDENCY_SECTIONS) {
		for (const dependency of Object.keys(manifest[section] ?? {})) dependencies.add(dependency);
	}

	if (name === CAPABILITY) {
		for (const dependency of dependencies) {
			if (dependency.startsWith(WORKSPACE_PREFIX)) {
				failures.push(
					`${CAPABILITY} must not depend on ${dependency}; the contract is what dependencies are checked against`,
				);
			}
		}
		continue;
	}

	const isCapability = shortName.startsWith("cap-");
	const isFeature = shortName.startsWith("feature-");
	if (!isCapability && !isFeature) continue;

	if (dependencies.has(DURABLE)) {
		failures.push(`${name} must not depend on ${DURABLE}; storage and scheduling go through runtime-kit (docs/structure.md §8)`);
	}
	if (isCapability && !dependencies.has(CAPABILITY)) {
		failures.push(`${name} must depend on ${CAPABILITY} so its descriptor is validated at registration (docs/structure.md §5.1)`);
	}
}

// Rule 4: built-in ceilings are declared next to the name that states the tool.
const sources = builtInSources();
for (const toolName of builtInToolNames()) {
	const declarer = `name: "${toolName}"`;
	const files = sources.filter((path) => readText(path).includes(declarer));
	if (files.length === 0) continue;
	const declared = files.filter((path) => readText(path).includes(DECLARATION_FIELD));
	if (declared.length === 0) {
		failures.push(
			`built-in tool "${toolName}" (${keyOf(files[0])}) declares no permissions[]; policy rules are written against built-ins, so an undeclared one is a hole`,
		);
	}
}

// Rule 5: the undeclared ledger, a ratchet that only tightens.
const baseline = readBaseline();
const current = undeclaredRegistrations();

if (write) {
	const next = {};
	const grown = [];
	for (const [path, count] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
		next[path] = count;
		const recorded = baseline[path];
		if (recorded !== undefined && count > recorded) grown.push(`${path} from ${recorded} to ${count}`);
	}
	if (grown.length > 0 && !allowGrow) {
		console.error("Refusing to record growth; the undeclared ledger only shrinks:");
		for (const entry of grown) console.error(`  ${entry}`);
		console.error("\nDeclare permissions[] at the registration site instead of widening the ledger.");
		console.error("A deliberate increase needs --write --allow-grow, explained in the change description.");
		process.exit(1);
	}
	const baselineTarget = join(ROOT, BASELINE_PATH);
	mkdirSync(dirname(baselineTarget), { recursive: true });
	writeFileSync(baselineTarget, `${JSON.stringify(next, null, "\t")}\n`);
	console.log(`Recorded ${Object.keys(next).length} file(s) registering tools without a declaration.`);
	for (const entry of grown) console.log(`  recorded growth: ${entry}`);
	process.exit(0);
}

for (const [path, count] of current) {
	const recorded = baseline[path];
	if (recorded === undefined) {
		failures.push(`${path} registers ${count} tool(s) with no permissions[] and is not in the ledger; declare them or run --write`);
		continue;
	}
	if (count > recorded) {
		failures.push(`${path} grew from ${recorded} to ${count} undeclared registration(s); the ledger only shrinks`);
	}
}

for (const path of Object.keys(baseline)) {
	if (!current.has(path)) {
		failures.push(`${path} is in ${BASELINE_PATH} but no longer registers an undeclared tool; run --write to prune it`);
	}
}

if (failures.length > 0) {
	for (const failure of failures) console.error(failure);
	console.error(`\n${failures.length} capability boundary violation(s). See docs/structure.md §5.1, §7, §8 and §11.`);
	process.exitCode = 1;
} else {
	console.log(
		`Capability boundaries hold (${checkedPackages} packages, ${current.size} ledger entr(y|ies)).`,
	);
}
