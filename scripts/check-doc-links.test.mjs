import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-doc-links.mjs", import.meta.url));

async function workspace(t, files) {
	const root = await mkdtemp(join(tmpdir(), "evoharness-doc-links-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

function run(root) {
	return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
}

test("a link to a missing file fails and names the target", async (t) => {
	const root = await workspace(t, { "docs/a.md": "See [b](./b.md).\n" });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /docs\/a\.md:1 -> \.\/b\.md/);
});

test("a link to an existing file passes", async (t) => {
	const root = await workspace(t, {
		"docs/a.md": "See [b](./b.md) and [c](./sub/c.md).\n",
		"docs/b.md": "# b\n",
		"docs/sub/c.md": "# c\n",
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /2 link\(s\) across 3 document\(s\) resolve/);
});

test("external URLs, bare anchors and links to a directory are ignored", async (t) => {
	const root = await workspace(t, {
		"docs/a.md": "[site](https://example.com) [jump](#section) [dir](./sub) [mail](mailto:a@b.c)\n",
		"docs/sub/.keep": "",
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("the root-level docs are checked too", async (t) => {
	const root = await workspace(t, { "AGENTS.md": "See [gone](./missing.md).\n" });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /AGENTS\.md:1 -> \.\/missing\.md/);
});

test("a fragment is stripped before resolving", async (t) => {
	const root = await workspace(t, {
		"docs/a.md": "See [b](./b.md#heading).\n",
		"docs/b.md": "# heading\n",
	});
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});
