#!/usr/bin/env node
/**
 * `docs/structure.md` §5.4 gives a new `cap-*` or `feature-*` package a one-page spec as its entry
 * ticket, and §7 says a directory built before its trigger condition is arrived is prepaid
 * maintenance. Both rules were prose only: nothing stopped a package from appearing with a
 * `package.json` and no stated reason for existing, which is exactly how the second kernel and the
 * grab-bag capabilities that §8 forbids tend to start.
 *
 * The guard checks existence, not quality. It asks for `packages/<name>/docs/spec.md` and the five
 * field labels the template names, because a page that answers those five is what a reviewer needs
 * to judge the change; whether the answers are true is a human call, and no grep can make that
 * decision. A page full of empty headings passes this guard and should fail its review.
 *
 * It is tree-based like `check:file-size`, not diff-based: no base ref to guess, and it keeps
 * applying after a package lands. Deleting the spec to pass is a visible act, and §8's ban on empty
 * placeholder packages already says what to do with a package nobody can write a spec for: don't
 * have it.
 *
 * Usage: node scripts/check-feature-spec.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT
	? resolve(process.env.EVOHARNESS_CHECK_ROOT)
	: process.cwd();
const PACKAGES_DIRECTORY = "packages";
const SPEC_PATH = ["docs", "spec.md"];
/** The field labels from the template in `docs/structure.md` §5.4. */
const REQUIRED_FIELDS = ["**内核档位**", "**DoD 档位**", "**硬前置**", "**验收**", "**Carry-over**"];
/** Package prefixes that owe a spec page, per `structure.md` §2. */
const SPEC_OWNING_PREFIXES = ["cap-", "feature-"];

/** Package directories under `packages/`, skipping anything that is not a package. */
function packageDirectories() {
	const directory = join(ROOT, PACKAGES_DIRECTORY);
	if (!existsSync(directory)) return [];
	return readdirSync(directory).filter((name) => {
		const full = join(directory, name);
		return statSync(full).isDirectory() && existsSync(join(full, "package.json"));
	});
}

const names = packageDirectories().filter((name) => SPEC_OWNING_PREFIXES.some((prefix) => name.startsWith(prefix)));

const failures = [];
for (const name of names) {
	const spec = join(ROOT, PACKAGES_DIRECTORY, name, ...SPEC_PATH);
	if (!existsSync(spec)) {
		failures.push(`packages/${name}: no docs/spec.md; write the one-page spec first (docs/structure.md §5.4)`);
		continue;
	}
	const text = readFileSync(spec, "utf8");
	const missing = REQUIRED_FIELDS.filter((field) => !text.includes(field));
	if (missing.length > 0) {
		failures.push(`packages/${name}/docs/spec.md: missing ${missing.join(", ")}`);
	}
}

if (failures.length > 0) {
	console.error("New capability or feature packages without a spec page:");
	for (const failure of failures) console.error(`  ${failure}`);
	console.error(`
The template is the code block in docs/structure.md §5.4. It exists to answer, before any code:
which kernel tier this needs, which Definition of Done applies, what it depends on, how it is
verified, and what was deferred. If a package cannot answer those, §7 says its trigger condition has
not arrived: leave the directory unbuilt rather than creating it and filling it in later.`);
	process.exit(1);
}

console.log(`check:feature-spec: ${names.length} cap-*/feature-* package(s) carry a spec page.`);
