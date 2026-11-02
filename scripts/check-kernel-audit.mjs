#!/usr/bin/env node
/**
 * KERNEL.md §3 makes every kernel change declare its tier before it is allowed: A adds an extension
 * point and brings a contract test, B changes semantics and brings a ledger entry, C is a structural
 * operation and brings a ledger entry too. "跳档 = 失败" is stated there as a rule; until this guard
 * existed the only way to break it was silently, and the deepest place in the repository is where a
 * silent change is hardest to find afterwards.
 *
 * The rule needs an evidence check, not a text check. A change touching a kernel path must also carry
 * one of:
 *   - a new `## D-xxx` entry in `docs/kernel/divergence.md` (tiers B and C), or
 *   - a changed test file inside the same package (tier A: the contract test that pins the behavior).
 *
 * Two exemptions keep the guard from becoming noise people route around. A diff whose every changed
 * line is a comment or whitespace decides no tier, because it changes neither what is written to
 * storage nor anyone's semantics. And `packages/chord` runs its own process (AGENTS.md "Chord v2 Code
 * Style": slice spec, feature map, reviewers), so it is out of scope here.
 *
 * The kernel path list mirrors the table in KERNEL.md §1. That table is the authority: where the two
 * disagree, the table wins and this list is the bug.
 *
 * Usage:
 *   node scripts/check-kernel-audit.mjs                 # staged, else the working tree
 *   node scripts/check-kernel-audit.mjs --staged        # staged files only
 *   node scripts/check-kernel-audit.mjs --base <ref>    # a committed branch vs <ref> (CI)
 * With GITHUB_BASE_REF set and no --base, the base defaults to origin/<GITHUB_BASE_REF>.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT
	? resolve(process.env.EVOHARNESS_CHECK_ROOT)
	: process.cwd();
const LEDGER = "docs/kernel/divergence.md";
const ENTRY = /^## (D-\d{3})\b/gmu;

/** Kernel locations, per KERNEL.md §1: a `/**` entry covers everything below that directory. */
const KERNEL_DIRECTORIES = [
	"packages/agent/src",
	"packages/coding-agent/src/core/compaction",
	"packages/coding-agent/src/core/extensions",
	"packages/coding-agent/src/core/tools",
];
const KERNEL_FILES = [
	"packages/coding-agent/src/core/project-trust.ts",
	"packages/coding-agent/src/core/resource-loader.ts",
	"packages/coding-agent/src/core/system-prompt.ts",
	"packages/coding-agent/src/core/event-bus.ts",
	"packages/coding-agent/src/core/trust-manager.ts",
];
const KERNEL_PREFIXES = ["packages/coding-agent/src/core/agent-session", "packages/coding-agent/src/core/session-"];

function git(args) {
	return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Repository-relative posix path, so failures read the same on every platform. */
function keyOf(file) {
	return relative(ROOT, file).split(sep).join("/");
}

function usage(messages) {
	for (const message of messages) console.error(`check:kernel-audit: ${message}`);
	console.error("Usage: node scripts/check-kernel-audit.mjs [--staged | --base <ref>]");
	process.exit(2);
}

function fail(messages) {
	console.error("Kernel change without the evidence its tier requires (KERNEL.md §3):");
	for (const message of messages) console.error(`  ${message}`);
	console.error(`
Pick a tier first, then bring its evidence in the same change:
  A  加扩展点   -> a contract test for the mechanism touched (packages/<pkg>/test/**)
  B  改语义     -> a new \`## D-xxx\` in ${LEDGER}, plus migration and contract tests
  C  结构手术   -> a new \`## D-xxx\`, one operation, no half measures
The question that picks the tier (KERNEL.md §3): does this change what is already written to storage,
or the semantics someone else depends on? Yes means B, not A.`);
	process.exit(1);
}

function isKernelPath(path) {
	if (path.startsWith("packages/chord/")) return false;
	return (
		KERNEL_DIRECTORIES.some((directory) => path.startsWith(`${directory}/`)) ||
		KERNEL_FILES.includes(path) ||
		KERNEL_PREFIXES.some((prefix) => path.startsWith(prefix))
	);
}

/** True when a source line carries no behavior: blank, or a comment line. */
function isNonSemantic(line) {
	const text = line.trim();
	if (text.length === 0) return true;
	return /^(?:\/\/|\/\*|\*\/|\*)/u.test(text);
}

/** Whether a unified diff moves only comments and whitespace. */
function diffIsCommentOnly(diff) {
	let sawBehavior = false;
	for (const line of diff.split("\n")) {
		if (!line.startsWith("+") && !line.startsWith("-")) continue;
		if (/^(?:\+\+\+|---)/u.test(line)) continue;
		if (isNonSemantic(line.slice(1))) continue;
		sawBehavior = true;
	}
	return !sawBehavior;
}

const argv = process.argv.slice(2);
let baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined;
let stagedOnly = false;
for (let index = 0; index < argv.length; index += 1) {
	const arg = argv[index];
	if (arg === "--staged") stagedOnly = true;
	else if (arg === "--base") {
		index += 1;
		baseRef = argv[index];
		if (!baseRef) usage(["--base needs a ref, for example --base origin/main"]);
	} else usage([`unknown argument: ${arg}`]);
}

const names = (args) => git(args).split("\n").filter(Boolean);
const staged = names(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "HEAD"]);

// A base ref only helps if the checkout actually has it: CI actions/checkout defaults to a single
// commit, so `origin/main` may be absent and the diff would throw instead of reporting. Skipping out
// loud is the honest answer; guessing a shallower base would silently widen what the guard sees.
function refExists(ref) {
	try {
		git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}
if (baseRef && !refExists(baseRef)) {
	console.log(`check:kernel-audit: skipped; base ref ${baseRef} is not in this checkout (shallow or single-commit).`);
	console.log("Fetch the base before running it, or pass --base <ref> that exists.");
	process.exit(0);
}

/** The change set and the two reads the evidence check needs, per caller situation. */
let changed;
let diffOf;
let ledgerNow;
if (baseRef) {
	changed = names(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`]);
	diffOf = (path) => git(["diff", "-U0", `${baseRef}...HEAD`, "--", path]);
	// The branch is committed, so the working copy is the state under review.
	ledgerNow = readLedgerFromDisk();
} else if (stagedOnly) {
	changed = staged;
	diffOf = (path) => git(["diff", "-U0", "--cached", "HEAD", "--", path]);
	ledgerNow = readStageLedger(":");
} else {
	changed = [
		...new Set([
			...staged,
			...names(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
			...names(["ls-files", "--others", "--exclude-standard"]),
		]),
	];
	diffOf = (path) =>
		git(["diff", "-U0", "--cached", "HEAD", "--", path]) || git(["diff", "-U0", "HEAD", "--", path]);
	ledgerNow = existsSync(join(ROOT, LEDGER)) ? readFileSync(join(ROOT, LEDGER), "utf8") : "";
}

if (changed.length === 0) {
	console.log("check:kernel-audit: no change set to inspect.");
	process.exit(0);
}

const kernelFiles = changed.filter(isKernelPath);
if (kernelFiles.length === 0) {
	console.log(`check:kernel-audit: ${changed.length} file(s) changed, none in the kernel.`);
	process.exit(0);
}

const behavioral = kernelFiles.filter((path) => !diffIsCommentOnly(diffOf(path)));
if (behavioral.length === 0) {
	console.log(`check:kernel-audit: ${kernelFiles.length} kernel file(s) touched, comments only.`);
	process.exit(0);
}

const before = new Set([...readStageLedger(`${baseRef ?? "HEAD"}:`).matchAll(ENTRY)].map((match) => match[1]));
const after = new Set([...ledgerNow.matchAll(ENTRY)].map((match) => match[1]));
const newEntries = [...after].filter((id) => !before.has(id));

const packagesTouched = new Set(behavioral.map((path) => keyOf(join(ROOT, path)).split("/")[1]));
const testEvidence = changed.filter(
	(path) => path.startsWith("packages/") && path.includes("/test/") && packagesTouched.has(path.split("/")[1]),
);

if (newEntries.length > 0 || testEvidence.length > 0) {
	const evidence = newEntries.length > 0 ? `ledger ${newEntries.join(", ")}` : `${testEvidence.length} test file(s)`;
	console.log(`check:kernel-audit: ${behavioral.length} kernel file(s) changed with ${evidence}.`);
	process.exit(0);
}

fail([
	...behavioral.map((path) => `${path} is kernel (KERNEL.md §1) and its diff changes behavior`),
	`ledger: no new \`## D-xxx\` in ${LEDGER}`,
	`tests: nothing under packages/{${[...packagesTouched].join(", ")}}/test/** in this change set`,
]);

/** The ledger as it stands in a git stage: `HEAD`, `origin/main`, or `:` for the index. */
function readStageLedger(ref) {
	try {
		return git(["show", `${ref}${LEDGER}`]);
	} catch {
		return "";
	}
}

function readLedgerFromDisk() {
	return existsSync(join(ROOT, LEDGER)) ? readFileSync(join(ROOT, LEDGER), "utf8") : "";
}
