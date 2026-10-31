#!/usr/bin/env node
/**
 * `docs/README.md` states that every link in the docs must point at a file that exists, and
 * `structure.md` §10 gives this guard its trigger: more than five handwritten docs. That many
 * exist now. A dead link is how a rule stops being executable without anyone noticing:
 * `AGENTS.md` pointed at two Chord v2 documents that a rebrand commit had deleted, and the
 * only way to find out was to try to read them.
 *
 * Scope is the written docs, not the code: `docs/**` and the root `*.md`. External URLs and
 * bare anchors are ignored, and a link to a directory only has to resolve to a directory.
 *
 * Usage: node scripts/check-doc-links.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.env.EVOHARNESS_CHECK_ROOT
	? resolve(process.env.EVOHARNESS_CHECK_ROOT)
	: process.cwd();
const DOCS_DIRECTORY = "docs";
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;

/** Every markdown file this guard owns: the docs tree plus the root-level docs. */
function markdownFiles() {
	const files = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = join(directory, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".md")) files.push(full);
		}
	};
	const docs = join(ROOT, DOCS_DIRECTORY);
	if (existsSync(docs)) walk(docs);
	for (const name of readdirSync(ROOT)) {
		const full = join(ROOT, name);
		if (name.endsWith(".md") && statSync(full).isFile()) files.push(full);
	}
	return files;
}

/** Repository-relative posix path, so failures read the same on every platform. */
function keyOf(file) {
	return relative(ROOT, file).split(sep).join("/");
}

const parsed = markdownFiles().map((file) => {
	const lines = readFileSync(file, "utf8").split("\n");
	return { file, lines };
});

const failures = [];
let linkCount = 0;
let documentCount = 0;

for (const { file, lines } of parsed) {
	for (const [index, line] of lines.entries()) {
		for (const match of line.matchAll(LINK)) {
			const target = match[1];
			if (EXTERNAL.test(target)) continue;
			linkCount += 1;
			if (target.startsWith("#")) continue;
			const path = target.split("#")[0];
			if (path.length === 0) continue;
			const absolute = resolve(dirname(file), decodeURI(path));
			if (existsSync(absolute)) continue;
			failures.push(`${keyOf(file)}:${index + 1} -> ${target}`);
		}
	}
	documentCount += 1;
}

if (failures.length > 0) {
	console.error("Dead links in the docs:");
	for (const failure of failures) console.error(`  ${failure}`);
	console.error(`\nSee docs/README.md ("文档里的链接必须指向真实存在的文件").`);
	process.exit(1);
}

console.log(`${linkCount} link(s) across ${documentCount} document(s) resolve.`);
