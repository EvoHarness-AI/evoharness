import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-file-size.mjs", import.meta.url));

/** A file whose physical line count is exactly `lines`. */
const body = (lines) => `${"const x = 1;\n".repeat(lines - 1)}const x = 1;\n`;

async function workspace(t, files) {
	const root = await mkdtemp(join(tmpdir(), "evoharness-file-size-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

function run(root, ...args) {
	return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
}

test("a new file above the limit fails and names the limit", async (t) => {
	const root = await workspace(t, { "packages/a/src/big.ts": body(1501) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /big\.ts is a new file at 1501 lines; the limit is 1500/);
});

test("a new file at exactly the limit passes", async (t) => {
	const root = await workspace(t, { "packages/a/src/edge.ts": body(1500) });
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("a frozen file may stay at its recorded size", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/big.ts": body(4000),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/big.ts": 4000 }),
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("a frozen file that grows fails, because the baseline only shrinks", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/big.ts": body(4001),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/big.ts": 4000 }),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /grew from 4000 to 4001 lines/);
});

test("a frozen file that shrinks stays green and asks to retire the entry", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/big.ts": body(1200),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/big.ts": 4000 }),
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /run --write to retire its entry/);
});

test("a baseline entry whose file is gone fails so the ledger cannot rot", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/small.ts": body(10),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/gone.ts": 2000 }),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /gone\.ts is in the baseline but no longer exists/);
});

test("--write records only files above the limit, sorted, and prunes retired entries", async (t) => {
	const root = await workspace(t, {
		"packages/b/src/big.ts": body(2000),
		"packages/a/src/big.ts": body(1600),
		"packages/a/src/small.ts": body(10),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/gone.ts": 2000 }),
	});
	const written = run(root, "--write");
	assert.equal(written.status, 0, written.stderr);
	const recorded = JSON.parse(
		await readFile(join(root, "scripts/file-size.baseline.json"), "utf8"),
	);
	assert.deepEqual(Object.keys(recorded), ["packages/a/src/big.ts", "packages/b/src/big.ts"]);
	assert.equal(recorded["packages/a/src/big.ts"], 1600);
	const verified = run(root);
	assert.equal(verified.status, 0, verified.stderr);
});

test("--write refuses to raise a recorded size", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/big.ts": body(4001),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/big.ts": 4000 }),
	});
	const result = run(root, "--write");
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Refusing to record growth/);
	assert.match(result.stderr, /big\.ts from 4000 to 4001/);
	const unchanged = JSON.parse(
		await readFile(join(root, "scripts/file-size.baseline.json"), "utf8"),
	);
	assert.equal(unchanged["packages/a/src/big.ts"], 4000);
});

test("--write --allow-grow records growth and asks for an explanation", async (t) => {
	const root = await workspace(t, {
		"packages/a/src/big.ts": body(4001),
		"scripts/file-size.baseline.json": JSON.stringify({ "packages/a/src/big.ts": 4000 }),
	});
	const result = run(root, "--write", "--allow-grow");
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Recorded growth for 1 file\(s\)/);
	const recorded = JSON.parse(
		await readFile(join(root, "scripts/file-size.baseline.json"), "utf8"),
	);
	assert.equal(recorded["packages/a/src/big.ts"], 4001);
	assert.equal(run(root).status, 0);
});

test("generated files are exempt from the limit", async (t) => {
	const root = await workspace(t, { "packages/ai/src/models.generated.ts": body(9000) });
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("node_modules and dist are never measured", async (t) => {
	const root = await workspace(t, {
		"packages/a/node_modules/dep/big.ts": body(9000),
		"packages/a/dist/big.ts": body(9000),
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});