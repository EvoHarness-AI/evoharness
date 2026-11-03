import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-capability-boundaries.mjs", import.meta.url));

const manifest = (name, dependencies = {}) => JSON.stringify({ name, version: "0.0.2", dependencies });

async function workspace(t, manifests) {
	const root = await mkdtemp(join(tmpdir(), "evoharness-capability-boundaries-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [directory, content] of Object.entries(manifests)) {
		const path = join(root, "packages", directory, "package.json");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
	return root;
}

function run(root) {
	return spawnSync(process.execPath, [script], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, EVOHARNESS_CHECK_ROOT: root },
	});
}

test("a contract package with no workspace dependency passes", async (t) => {
	const root = await workspace(t, {
		capability: manifest("@evoharness/capability"),
		"cap-browser": manifest("@evoharness/cap-browser", { "@evoharness/capability": "0.0.2" }),
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Capability boundaries hold/);
});

test("the contract package may not depend on another workspace package", async (t) => {
	const root = await workspace(t, {
		capability: manifest("@evoharness/capability", { "@evoharness/agent-core": "0.0.2" }),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/capability must not depend on @evoharness\/agent-core/);
});

test("a capability without the contract dependency fails", async (t) => {
	const root = await workspace(t, {
		capability: manifest("@evoharness/capability"),
		"cap-browser": manifest("@evoharness/cap-browser", { "@evoharness/ai": "0.0.2" }),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/cap-browser must depend on @evoharness\/capability/);
});

test("a capability or feature reaching durable fails", async (t) => {
	const root = await workspace(t, {
		capability: manifest("@evoharness/capability"),
		"cap-browser": manifest("@evoharness/cap-browser", {
			"@evoharness/capability": "0.0.2",
			"@evoharness/durable": "0.0.2",
		}),
		"feature-proactive": manifest("@evoharness/feature-proactive", {
			"@evoharness/durable": "0.0.2",
		}),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/cap-browser must not depend on @evoharness\/durable/);
	assert.match(result.stderr, /@evoharness\/feature-proactive must not depend on @evoharness\/durable/);
});

test("packages that are not capabilities are left alone", async (t) => {
	const root = await workspace(t, {
		capability: manifest("@evoharness/capability"),
		"coding-agent": manifest("@evoharness/coding-agent", { "@evoharness/durable": "0.0.2" }),
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});
