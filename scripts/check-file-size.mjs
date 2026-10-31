#!/usr/bin/env node
/**
 * `docs/structure.md` §1 states "single file ≤ 1500 lines". Until this guard existed that
 * sentence was unenforceable prose: 29 source files were already past it, the largest at 4.3×,
 * and nothing failed. A limit nobody can check is worse than no limit, because it reads as
 * "already handled".
 *
 * So the limit becomes a ratchet rather than a promise:
 *
 *   - a file that is not in the baseline must stay at or below MAX_LINES;
 *   - a file in the baseline may not grow past its recorded size, and may only shrink;
 *   - a baseline entry whose file is gone is stale and fails, so the ledger cannot rot.
 *
 * Existing debt is frozen, not forgiven. A frozen file that needs more code is not a
 * permission to grow: offset the growth in the same change (new file plus one call, rewrite in
 * place, or move a cohesive block out). `--write` therefore only retires entries and records
 * files that are new to the baseline; it refuses to raise a recorded size. Growth needs
 * `--allow-grow`, an explicit human decision that shows up in the baseline diff and must be
 * explained in the change description. `check` never writes.
 *
 * Usage:
 *   node scripts/check-file-size.mjs                        # verify (read-only)
 *   node scripts/check-file-size.mjs --write                # retire entries, record new ones
 *   node scripts/check-file-size.mjs --write --allow-grow   # record growth (human decision)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT ? resolve(process.env.EVOHARNESS_CHECK_ROOT) : process.cwd();
const MAX_LINES = 1500;
const BASELINE_PATH = "scripts/file-size.baseline.json";
const SOURCE_ROOTS = ["packages", "apps", "scripts"];

/**
 * The only ways to make room inside a frozen file, printed whenever the ratchet fails so the
 * next step does not have to be guessed.
 */
const GROWTH_PATHS = [
	"put the new logic in a new file and replace the lines it touches with one call;",
	"rewrite in place so the file's line count does not change;",
	"move a cohesive block out in the same change, so the file ends up smaller.",
];
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".artifacts", ".git", "coverage", ".cache"]);
const GENERATED_FILE = /\.generated\.[cm]?[jt]sx?$/u;

/**
 * Line count on the physical-line convention `wc -l` uses, so the baseline matches what a
 * reviewer sees in an editor gutter.
 */
function lineCount(text) {
	const newlines = (text.match(/\n/gu) ?? []).length;
	return newlines + (text.length > 0 && !text.endsWith("\n") ? 1 : 0);
}

function walk(directory, out = []) {
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
			walk(join(directory, entry.name), out);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!SOURCE_EXTENSIONS.test(entry.name)) continue;
		if (GENERATED_FILE.test(entry.name)) continue;
		out.push(join(directory, entry.name));
	}
	return out;
}

/** Repository-relative posix path, so the baseline is stable across platforms. */
function keyOf(root, absolute) {
	return relative(root, absolute).split(sep).join("/");
}

function measure() {
	const sizes = new Map();
	for (const root of SOURCE_ROOTS) {
		for (const file of walk(join(ROOT, root))) {
			sizes.set(keyOf(ROOT, file), lineCount(readFileSync(file, "utf8")));
		}
	}
	return sizes;
}

function readBaseline() {
	let raw;
	try {
		raw = readFileSync(join(ROOT, BASELINE_PATH), "utf8");
	} catch {
		return {};
	}
	const value = JSON.parse(raw);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		console.error(`${BASELINE_PATH} must be an object of path → recorded line count`);
		process.exit(1);
	}
	for (const [path, size] of Object.entries(value)) {
		if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
			console.error(`${BASELINE_PATH}: invalid recorded size for ${path}`);
			process.exit(1);
		}
	}
	return value;
}

const baseline = readBaseline();
const current = measure();

if (process.argv.includes("--write")) {
	const allowGrow = process.argv.includes("--allow-grow");
	const next = {};
	const grown = [];
	for (const [path, size] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
		if (size <= MAX_LINES) continue;
		next[path] = size;
		const recorded = baseline[path];
		if (recorded !== undefined && size > recorded) grown.push(`${path} from ${recorded} to ${size}`);
	}
	if (grown.length > 0 && !allowGrow) {
		console.error("Refusing to record growth; the baseline only shrinks:");
		for (const entry of grown) console.error(`  ${entry}`);
		console.error("\nOffset the growth in the same change instead:");
		for (const line of GROWTH_PATHS) console.error(`  ${line}`);
		console.error(
			"\nIf the growth is deliberate (a merge of two files, a decision by the owner), rerun with",
		);
		console.error("--write --allow-grow and explain it in the change description.");
		process.exit(1);
	}
	writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(next, null, "\t")}\n`);
	console.log(
		`Recorded ${Object.keys(next).length} file(s) above ${MAX_LINES} lines in ${BASELINE_PATH}.`,
	);
	if (grown.length > 0) {
		console.log(`Recorded growth for ${grown.length} file(s); explain it in the change description:`);
		for (const entry of grown) console.log(`  ${entry}`);
	}
	process.exit(0);
}

const failures = [];

for (const [path, size] of current) {
	const recorded = baseline[path];
	if (recorded === undefined) {
		if (size > MAX_LINES) {
			failures.push(`${path} is a new file at ${size} lines; the limit is ${MAX_LINES}`);
		}
		continue;
	}
	if (size > recorded) {
		failures.push(`${path} grew from ${recorded} to ${size} lines (+${size - recorded}); the baseline only shrinks`);
	}
	if (size <= MAX_LINES) {
		console.log(`${path} is back under ${MAX_LINES} (${size}); run --write to retire its entry.`);
	}
}

for (const path of Object.keys(baseline)) {
	if (!current.has(path)) {
		failures.push(`${path} is in the baseline but no longer exists; run --write to prune it`);
	}
}

const frozen = Object.keys(baseline).length;

if (failures.length > 0) {
	console.error("File size ratchet failed:");
	for (const failure of failures) console.error(`  ${failure}`);
	console.error(`\nSee docs/structure.md §1. ${frozen} file(s) frozen above ${MAX_LINES}.`);
	console.error("Offset the growth in the same change instead of re-recording the baseline:");
	for (const line of GROWTH_PATHS) console.error(`  ${line}`);
	process.exit(1);
}

console.log(
	`File size ratchet holds (${current.size} source files, ${frozen} frozen above ${MAX_LINES}).`,
);