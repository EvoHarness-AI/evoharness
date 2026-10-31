#!/usr/bin/env node
/**
 * Relative-link checker for the vendored web app's own documentation.
 *
 * The root `check:doc-links` covers root `docs/` only; this one keeps the same
 * promise for `apps/evoharness-web` (README.md, CHANGELOG.md and docs/**):
 * every relative markdown link must resolve to an existing file. External
 * URLs, pure anchors and absolute paths are skipped, mirroring the root
 * guard's scope.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const APP = join(ROOT, "apps", "evoharness-web");

function markdownFilesUnder(dir, prefix = "") {
	const out = [];
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...markdownFilesUnder(join(dir, entry.name), name));
		else if (entry.isFile() && entry.name.endsWith(".md")) out.push(name);
	}
	return out;
}

const docs = [
	...["README.md", "CHANGELOG.md"].filter((name) => existsSync(join(APP, name))),
	...markdownFilesUnder(join(APP, "docs"), "docs"),
];

const failures = [];
for (const docPath of docs) {
	const absolute = join(APP, docPath);
	if (!statSync(absolute).isFile()) continue;
	const text = readFileSync(absolute, "utf8");
	for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
		const target = match[1];
		if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) continue; // external / mailto
		if (target.startsWith("#") || target.startsWith("/")) continue;
		const withoutAnchor = target.split("#")[0];
		if (withoutAnchor === "") continue;
		const docDir = docPath.includes("/") ? join(APP, docPath, "..") : APP;
		const resolved = join(docDir, decodeURIComponent(withoutAnchor));
		if (!existsSync(resolved) || !statSync(resolved).isFile()) {
			failures.push(`${docPath}: ${target} (resolved to ${relative(APP, resolved).split(sep).join("/")})`);
		}
	}
}

if (failures.length > 0) {
	console.error(`check-web-doc-links: ${failures.length} broken relative link(s):`);
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`Web doc links resolve (${docs.length} document(s) scanned).`);
