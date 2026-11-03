#!/usr/bin/env node
/**
 * `docs/structure.md` §5.1 says a `cap-*` package depends on `@evoharness/capability`, §8 says no cap
 * reaches `durable` directly, and §7 says the contract lands before the first capability does. Until
 * this guard existed all three were prose, and the failure they describe is invisible: a capability
 * that never declares against the vocabulary still registers, still runs, and the policy layer is
 * left guessing what it may touch.
 *
 * Three rules, each kept to what a manifest can actually prove:
 *
 *   1. `@evoharness/capability` depends on no workspace package. The contract describes effects; if it
 *      imported upward into the kernel or a capability it would stop being the thing they are checked
 *      against.
 *   2. `cap-*` and `feature-*` may not depend on `@evoharness/durable`. Storage goes through
 *      `runtime-kit` (§8), and durable still contains the dormant second kernel.
 *   3. `cap-*` depends on `@evoharness/capability`, so its descriptor is checked at registration
 *      instead of asserted in a README.
 *
 * Rules 2 and 3 are vacuous today because no `cap-*` package exists yet. They are here so that the
 * first one is born inside the boundary rather than patched into it later.
 *
 * Exit 1 with one line per violation.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findPackageDirectories } from "./package-workspaces.mjs";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT ? resolve(process.env.EVOHARNESS_CHECK_ROOT) : process.cwd();
const CAPABILITY = "@evoharness/capability";
const DURABLE = "@evoharness/durable";
const WORKSPACE_PREFIX = "@evoharness/";
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

const failures = [];
let checked = 0;

for (const directory of findPackageDirectories(join(ROOT, "packages"))) {
	const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
	const name = manifest.name;
	if (!name) continue;
	checked += 1;
	const shortName = name.startsWith(WORKSPACE_PREFIX) ? name.slice(WORKSPACE_PREFIX.length) : name;
	const dependencies = new Set();
	for (const section of DEPENDENCY_SECTIONS) {
		for (const dependency of Object.keys(manifest[section] ?? {})) dependencies.add(dependency);
	}

	if (name === CAPABILITY) {
		for (const dependency of dependencies) {
			if (dependency.startsWith(WORKSPACE_PREFIX)) {
				failures.push(`${CAPABILITY} must not depend on ${dependency}; the contract is what dependencies are checked against`);
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

if (failures.length > 0) {
	for (const failure of failures) console.error(failure);
	console.error(`\n${failures.length} capability boundary violation(s). See docs/structure.md §5.1, §7 and §8.`);
	process.exitCode = 1;
} else {
	console.log(`Capability boundaries hold (${checked} workspace packages checked).`);
}
