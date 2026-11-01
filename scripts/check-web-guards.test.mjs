// Fixture tests for the three web-app guards. The guards scan by cwd, so each
// test builds a minimal repository root under a temp dir, runs the guard with
// that root as cwd, and asserts the exit code plus the reason in stderr. A
// guard that silently stops catching anything (bad regex, swallowed error)
// fails here even while the real repo stays green.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const GUARD_DIR = join(dirname(fileURLToPath(import.meta.url)));
const APP_DIRS = ["app", "lib", "components", "hooks", "bin", "scripts", "e2e", "public"];

function makeRoot(files = {}) {
	const root = mkdtempSync(join(tmpdir(), "web-guard-fixture-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture-root", version: "0.0.0" }));
	mkdirSync(join(root, "packages", "sample"), { recursive: true });
	mkdirSync(join(root, "apps", "evoharness-web"), { recursive: true });
	for (const dir of APP_DIRS) mkdirSync(join(root, "apps", "evoharness-web", dir), { recursive: true });
	// The boundary guard requires this file with the lockstep shape.
	writeFileSync(
		join(root, "apps", "evoharness-web", "lib", "branding.ts"),
		'export const APP_VERSION = "0.0.0" as const;\n',
	);
	for (const [path, text] of Object.entries(files)) {
		const absolute = join(root, path);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, text);
	}
	return root;
}

const roots = [];
function runGuard(script, root) {
	const result = spawnSync(process.execPath, [join(GUARD_DIR, script)], { cwd: root, encoding: "utf8" });
	return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
function withRoot(files) {
	const root = makeRoot(files);
	roots.push(root);
	return root;
}

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("a clean fixture passes all three guards", () => {
	for (const script of ["check-web-names.mjs", "check-web-boundary.mjs", "check-web-doc-links.mjs"]) {
		const run = runGuard(script, withRoot());
		assert.equal(run.status, 0, `${script} said: ${run.output}`);
	}
});

test("check-web-names catches upstream scopes, PascalCase and camelCase identifiers, and header residue", () => {
	const cases = [
		["@agegr/pi-web", "upstream npm scope"],
		["import { createPiWebBuiltinExtensions }", "PascalCase identifier"],
		["const piWebFactory = 1;", "camelCase identifier"],
		['res.setHeader("X-Pi-Dest-Path", p);', "header name"],
		['const dir = join(cwd, ".pi", "mcp.json");', "config directory literal"],
	];
	for (const [code, why] of cases) {
		const run = runGuard("check-web-names.mjs", withRoot({ "apps/evoharness-web/lib/probe.ts": code }));
		assert.equal(run.status, 1, `${why}: expected red, got: ${run.output}`);
		assert.match(run.output, /rename residue site/, `${why}: wrong failure shape`);
	}
});

test("check-web-names does not fire on .pi-like property access or ordinary prose", () => {
	// this.pi is the SDK MCP host property (upstream identifier, not a path);
	// ".pivot" and "API." must not trip the literal forms either.
	const code = ['this.pi.registerMcpServer(name, config);', "const v = obj.pivot;", 'export const API_PATH = "/x";'].join("\n");
	const run = runGuard("check-web-names.mjs", withRoot({ "apps/evoharness-web/lib/probe.ts": code }));
	assert.equal(run.status, 0, run.output);
});

test("check-web-boundary catches both import directions and version drift", () => {
	const reverse = runGuard(
		"check-web-boundary.mjs",
		withRoot({ "packages/sample/index.ts": 'import { x } from "../../apps/evoharness-web/lib/y";' }),
	);
	assert.equal(reverse.status, 1, reverse.output);
	assert.match(reverse.output, /imports from apps\/|imports "@evoharness\/web"/u);

	const srcImport = runGuard(
		"check-web-boundary.mjs",
		withRoot({ "apps/evoharness-web/lib/probe.ts": 'import { a } from "@evoharness/agent-core/src/a";' }),
	);
	assert.equal(srcImport.status, 1, srcImport.output);
	assert.match(srcImport.output, /src\//u);

	const drifted = runGuard(
		"check-web-boundary.mjs",
		withRoot({ "apps/evoharness-web/lib/branding.ts": 'export const APP_VERSION = "9.9.9" as const;\n' }),
	);
	assert.equal(drifted.status, 1, drifted.output);
	assert.match(drifted.output, /APP_VERSION 9\.9\.9 != root version 0\.0\.0/u);
});

test("check-web-doc-links catches broken relative links and accepts resolvable ones", () => {
	const broken = runGuard(
		"check-web-doc-links.mjs",
		withRoot({ "apps/evoharness-web/README.md": "[guide](docs/missing.md)\n" }),
	);
	assert.equal(broken.status, 1, broken.output);
	assert.match(broken.output, /broken relative link/u);

	const fixed = runGuard(
		"check-web-doc-links.mjs",
		withRoot({
			"apps/evoharness-web/README.md": "[guide](docs/guide.md)\n",
			"apps/evoharness-web/docs/guide.md": "# guide\n",
		}),
	);
	assert.equal(fixed.status, 0, fixed.output);
});

test("the guards read the repo they are pointed at (cwd-relative, not import.meta-relative)", () => {
	// If a guard ever resolves its app path from its own file location instead
	// of cwd, it would scan the real repo while the fixture says clean, and the
	// clean-fixture test above would stop meaning anything.
	const source = readFileSync(join(GUARD_DIR, "check-web-names.mjs"), "utf8");
	assert.match(source, /const ROOT = process\.cwd\(\);/u);
});
