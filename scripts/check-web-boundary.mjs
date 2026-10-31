#!/usr/bin/env node
/**
 * Structural boundary guard for the vendored web app (docs/plan/web-frontend-spec.md §3.11).
 *
 * Three assertions:
 * 1. `packages/**` never imports `apps/**` — the dependency direction is one-way:
 *    the app consumes the core's public exports, never the reverse.
 * 2. `apps/evoharness-web` never imports `packages/*` file paths (including
 *    package src/ subtrees) — it may only use the `@evoharness/*` package
 *    exports, so the dist-first contract (spec §0.1 D1) holds.
 * 3. The app's `APP_VERSION` literal stays equal to the root package.json
 *    version — `sync-versions.js` only covers `packages/`, so this is the
 *    lockstep check that keeps the private app from drifting.
 *
 * (A per-commit "packages/ has no diff in Phase 0/1" check is a review-A item,
 * not a global guard: several sessions share this working tree, and a static
 * assertion here would go red on another session's in-flight work.)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const APP = "apps/evoharness-web";
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx|mjs|cjs)$/u;

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (["node_modules", "dist", ".next", ".next-desktop", ".git"].includes(entry.name)) continue;
			yield* walk(join(dir, entry.name));
			continue;
		}
		if (entry.isFile() && SOURCE.test(entry.name)) yield join(dir, entry.name);
	}
}

const failures = [];

// 1. packages/** must not import apps/** (including the app's package name).
const importAppsPattern = /(?:from|import|require\()\s*["'][^"']*(?:^|\/)apps\/[^"']*["']/u;
for (const file of walk(join(ROOT, "packages"))) {
	const text = readFileSync(file, "utf8");
	if (text.includes('"@evoharness/web"')) {
		failures.push(`${relative(ROOT, file).split(sep).join("/")}: imports "@evoharness/web"`);
	}
	if (importAppsPattern.test(text)) {
		failures.push(`${relative(ROOT, file).split(sep).join("/")}: imports from apps/`);
	}
}

// 2. The app may only consume @evoharness/* package exports, never package file paths.
const appImportsPattern = /["'][^"']*packages\/[^"']*["']/u;
const appSrcPattern = /["']@evoharness\/[a-z-]+\/src\/[^"']*["']/u;
for (const file of walk(join(ROOT, APP))) {
	const key = relative(ROOT, file).split(sep).join("/");
	const text = readFileSync(file, "utf8");
	if (appImportsPattern.test(text)) {
		failures.push(`${key}: imports a packages/ file path (use the @evoharness/* exports)`);
	}
	if (appSrcPattern.test(text)) {
		failures.push(`${key}: imports a package's src/ (dist-first contract, spec §0.1 D1)`);
	}
}

// 3. Version lockstep between the root release and the private app.
const rootVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const branding = readFileSync(join(ROOT, APP, "lib", "branding.ts"), "utf8");
const brandingMatch = branding.match(/APP_VERSION = "(\d+\.\d+\.\d+)" as const;/u);
if (!brandingMatch) {
	failures.push(`${APP}/lib/branding.ts: APP_VERSION literal not found (keep the 'x.y.z' as const shape)`);
} else if (brandingMatch[1] !== rootVersion) {
	failures.push(`${APP}/lib/branding.ts: APP_VERSION ${brandingMatch[1]} != root version ${rootVersion}`);
}

if (failures.length > 0) {
	console.error(`check-web-boundary: ${failures.length} violation(s):`);
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log("Web boundary holds (one-way imports, dist-only consumption, version lockstep).");
