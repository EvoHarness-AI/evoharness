import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-parked-triggers.mjs", import.meta.url));

/** A complete entry, with any field replaceable or removable. */
function entry(overrides = {}) {
	const fields = {
		条件: "`packages/*/never/*/nothing` >= 99",
		复核: "`review_by 2099-01-01`",
		前提: "包多了才划算。",
		判断依据: "出现了就做。",
		...overrides,
	};
	const lines = Object.entries(fields)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `- ${key}：${value}`)
		.join("\n");
	return `- 判断依据兜底：出现了就做。\n${lines}`;
}

async function workspace(t, bodies) {
	const root = await mkdtemp(join(tmpdir(), "evoharness-parked-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "docs/plan"), { recursive: true });
	const body = Object.entries(bodies)
		.map(([title, text]) => `### ${title}\n\n${text}\n`)
		.join("\n");
	await writeFile(join(root, "docs/plan/parked.md"), `# parked\n\n## 条目\n\n${body}`);
	return root;
}

function run(root) {
	return spawnSync(process.execPath, [script], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, EVOHARNESS_CHECK_ROOT: root },
	});
}

test("stays quiet while neither the condition nor the review date has arrived", async (t) => {
	const root = await workspace(t, { 按diff选车道: entry() });
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /1 parked idea\(s\) armed/);
});

test("accepts 仅复核 as the honest form of an unobservable trigger", async (t) => {
	const root = await workspace(t, { 负控规则: entry({ 条件: "仅复核" }) });
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("goes red when a review_by date has passed", async (t) => {
	const root = await workspace(t, { 过期条目: entry({ 复核: "`review_by 2020-01-01`" }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /到期复核到点/);
	assert.match(result.stderr, /review_by 2020-01-01/);
});

test("goes red when a path_exists condition is satisfied", async (t) => {
	const root = await workspace(t, { 等一个目录: entry({ 条件: "`path_exists docs/plan`" }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /触发条件到点/);
	assert.match(result.stderr, /path docs\/plan exists/);
});

test("stays quiet when a path_exists target is missing", async (t) => {
	const root = await workspace(t, { 等一个目录: entry({ 条件: "`path_exists docs/plan/never`" }) });
	const result = run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("goes red when a glob threshold is met", async (t) => {
	const root = await workspace(t, { 等包数: entry({ 条件: "`packages/*/package.json` >= 1" }) });
	await mkdir(join(root, "packages/demo"), { recursive: true });
	await writeFile(join(root, "packages/demo/package.json"), "{}");
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /触发条件到点/);
	assert.match(result.stderr, /matched 1 \(threshold 1\)/);
});

test("lists every arrived entry in one pass", async (t) => {
	const root = await workspace(t, {
		甲: entry({ 条件: "仅复核", 复核: "`review_by 2020-01-01`" }),
		乙: entry({ 条件: "仅复核", 复核: "`review_by 2020-02-02`" }),
	});
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /2 条 parked 条目到点/);
	assert.match(result.stderr, /「甲」/);
	assert.match(result.stderr, /「乙」/);
});

test("rejects entries with missing fields", async (t) => {
	const root = await workspace(t, { 缺字段: entry({ 前提: undefined, 判断依据: undefined }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /缺少字段：前提：/);
	assert.match(result.stderr, /缺少字段：判断依据：/);
});

test("rejects unsupported condition expressions", async (t) => {
	const root = await workspace(t, { 乱写条件: entry({ 条件: "等风来" }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /无法判定/);
});

test("rejects malformed review dates as undecidable", async (t) => {
	const root = await workspace(t, { 日期乱写: entry({ 复核: "`review_by 2026-13-99`" }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /无法判定/);
});

test("file is required", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "evoharness-parked-empty-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /缺少/);
});

test("goes red when the section structure is lost but entry fields remain", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "evoharness-parked-drift-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "docs/plan"), { recursive: true });
	await writeFile(
		join(root, "docs/plan/parked.md"),
		"# parked\n\n## Entries\n\n- 条件：`仅复核`\n- 复核：`review_by 2099-01-01`\n- 前提：x\n- 判断依据：y\n",
	);
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /假绿/);
});

test("reminds that leaving it parked is not an option", async (t) => {
	const root = await workspace(t, { 过期: entry({ 复核: "`review_by 2020-01-01`" }) });
	const result = run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /三选一/);
});
