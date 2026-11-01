#!/usr/bin/env node
/**
 * Dependency direction is the one property a refactor cannot quietly undo, and `package.json`
 * is where it is lost first: one convenient import from a product package inside a platform
 * package, and "only one runtime" stops being true. Nothing about that fails a type check —
 * the import resolves, the build passes, and the cost appears when the layers are extracted.
 *
 * So this guard reads manifests (plus one narrow source scan for the dormant durable loop) and
 * holds the directions `docs/structure.md` §1 states:
 *
 *   platform    only platform
 *   kernel      platform                     (agent-core -> ai)
 *   kit         platform                     (runtime-kit)
 *   capability  platform                     (cap-* never imports another cap)
 *   surface     kernel + platform
 *   feature     capability + kit + kernel + platform
 *   product     everything below it          (coding-agent)
 *   eval        everything below it          (evals)
 *   extension   everything below it          (subagents: an extension legitimately sits on top of its host)
 *   anything    never eval
 *
 * Two extra rules keep today's shape from drifting:
 *   1. `coding-agent` may only depend on the internal packages it already depends on. Adding one
 *      is a deliberate edit of PRODUCT_INTERNAL_ALLOWLIST, not an accident.
 *   2. Only `runtime-kit` and `env` may reach into `durable/src/harness`. The durable agent loop
 *      stays dormant; this turns that promise into something the machine checks.
 *
 * Exit 1 with one line per violation.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findPackageDirectories } from "./package-workspaces.mjs";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT ? resolve(process.env.EVOHARNESS_CHECK_ROOT) : process.cwd();
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const SKIPPED_PATH_SEGMENTS = ["/examples/", "/install-lock/", "/test/", "/dist/"];

const PRODUCT_INTERNAL_ALLOWLIST = new Set([
	"@evoharness/agent-core",
	"@evoharness/ai",
	"@evoharness/codemode",
	"@evoharness/mcp",
	"@evoharness/tui",
]);

/** Layers and what each one may depend on. `platform` may depend on `platform`. */
const ALLOWED = {
	platform: new Set(["platform"]),
	kernel: new Set(["platform"]),
	kit: new Set(["platform"]),
	capability: new Set(["platform"]),
	surface: new Set(["kernel", "platform"]),
	feature: new Set(["capability", "kit", "kernel", "platform"]),
	product: new Set(["kernel", "capability", "feature", "surface", "kit", "platform"]),
	eval: new Set(["product", "kernel", "capability", "feature", "surface", "kit", "platform"]),
	extension: new Set(["product", "kernel", "capability", "feature", "surface", "kit", "platform"]),
};

const HARNESS_IMPORT = /from\s+"(?:@evoharness\/durable\/harness|.*durable\/src\/harness[^"]*)"/u;
const HARNESS_READERS = new Set(["@evoharness/runtime-kit", "@evoharness/env"]);

function layerOf(name) {
	if (name === "@evoharness/agent-core" || name === "@evoharness/kernel") return "kernel";
	if (name === "@evoharness/coding-agent") return "product";
	if (name === "@evoharness/evals") return "eval";
	if (name === "@evoharness/subagents") return "extension";
	if (name === "@evoharness/runtime-kit") return "kit";
	if (name === "@evoharness/capability") return "platform";
	if (name.startsWith("@evoharness/cap-")) return "capability";
	if (name.startsWith("@evoharness/feature-")) return "feature";
	if (name.startsWith("@evoharness/surface-")) return "surface";
	return "platform";
}

const failures = [];
const packages = new Map();

for (const directory of findPackageDirectories(join(ROOT, "packages"))) {
	const manifestPath = join(directory, "package.json");
	const relativeDirectory = `/${relative(ROOT, directory).split("\\").join("/")}/`;
	if (SKIPPED_PATH_SEGMENTS.some((segment) => relativeDirectory.includes(segment))) continue;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (!manifest.name) continue;
	packages.set(manifest.name, {
		manifest,
		directory,
		layer: layerOf(manifest.name),
	});
}

const graph = new Map();
for (const [name, pkg] of packages) {
	const targets = new Set();
	for (const section of DEPENDENCY_SECTIONS) {
		for (const dependency of Object.keys(pkg.manifest[section] ?? {})) {
			if (!dependency.startsWith("@evoharness/") || dependency === name) continue;
			if (!packages.has(dependency)) continue;
			targets.add(dependency);
		}
	}
	graph.set(name, targets);
}

for (const [name, targets] of graph) {
	const layer = packages.get(name).layer;
	for (const target of targets) {
		const targetLayer = packages.get(target).layer;
		if (!ALLOWED[layer].has(targetLayer)) {
			failures.push(`${name} (${layer}) must not depend on ${target} (${targetLayer})`);
		}
		if (layer === "product" && !PRODUCT_INTERNAL_ALLOWLIST.has(target)) {
			failures.push(
				`${name} depends on ${target}, which is not in PRODUCT_INTERNAL_ALLOWLIST; add it deliberately if the direction is intended`,
			);
		}
	}
}

// Two-node cycles are the common slip; report them with both edges named.
for (const [name, targets] of graph) {
	for (const target of targets) {
		if (target <= name) continue;
		if (graph.get(target)?.has(name)) failures.push(`${name} and ${target} depend on each other`);
	}
}

// The durable agent loop stays dormant. Only the runtime kit and the remote environment may reach it.
for (const [name, pkg] of packages) {
	if (HARNESS_READERS.has(name)) continue;
	const sourceRoot = join(pkg.directory, "src");
	if (!existsSync(sourceRoot)) continue;
	for (const file of walk(sourceRoot)) {
		const source = readFileSync(file, "utf8");
		if (HARNESS_IMPORT.test(source)) {
			failures.push(`${relative(ROOT, file).split("\\").join("/")} imports the dormant durable harness`);
		}
	}
}

function walk(directory, out = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			walk(path, out);
		} else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/u.test(entry.name)) {
			out.push(path);
		}
	}
	return out;
}

if (failures.length > 0) {
	for (const failure of failures) console.error(failure);
	console.error(`\n${failures.length} layering violation(s). See docs/structure.md §1 and §10.`);
	process.exitCode = 1;
} else {
	console.log(`Package layers hold (${packages.size} workspace packages checked).`);
}
