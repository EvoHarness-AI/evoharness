import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-capability-boundaries.mjs", import.meta.url));
const ledgerPath = "scripts/capability-permissions.baseline.json";

const manifest = (name, dependencies = {}) => JSON.stringify({ name, version: "0.0.2", dependencies });

/** A tools barrel that lists one built-in, plus the file that either declares its ceiling or does not. */
const toolsBarrel = [
	"export type ToolName = \"read\";",
	"export const allToolNames: Set<ToolName> = new Set([",
	"\t\"read\",",
	"]) as never;",
	"",
].join("\n");

const builtInFile = (declared) =>
	[
		"export function createReadToolDefinition() {",
		"\treturn {",
		"\t\tname: \"read\",",
		"\t\tlabel: \"read\",",
		declared ? "\t\tpermissions: [\"fs.read\"]," : "",
		"\t};",
		"}",
		"",
	].filter((line) => line !== "").join("\n");

const extensionWithUndeclaredTool = [
	"export default function (evoharness) {",
	"\tevoharness.registerTool({ name: \"legacy\", execute: async () => ({ content: [] }) });",
	"}",
	"",
].join("\n");

/** The same extension, grown by one more undeclared registration. */
const extensionWithSecondRegistration = [
	"export default function (evoharness) {",
	"\tevoharness.registerTool({ name: \"legacy\", execute: async () => ({ content: [] }) });",
	"\tevoharness.registerTool({ name: \"second\", execute: async () => ({ content: [] }) });",
	"}",
	"",
].join("\n");

async function workspace(t, files) {
	const root = await mkdtemp(join(tmpdir(), "evoharness-capability-boundaries-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [path, content] of Object.entries(files)) {
		const absolute = join(root, path);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, content);
	}
	return root;
}

async function run(root, ...args) {
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, EVOHARNESS_CHECK_ROOT: root },
	});
	return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("a contract package with no workspace dependency passes", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/cap-browser/package.json": manifest("@evoharness/cap-browser", { "@evoharness/capability": "0.0.2" }),
	});
	const result = await run(root);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Capability boundaries hold/);
});

test("the contract package may not depend on another workspace package", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability", { "@evoharness/agent-core": "0.0.2" }),
	});
	const result = await run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/capability must not depend on @evoharness\/agent-core/);
});

test("a capability without the contract dependency fails", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/cap-browser/package.json": manifest("@evoharness/cap-browser", { "@evoharness/ai": "0.0.2" }),
	});
	const result = await run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/cap-browser must depend on @evoharness\/capability/);
});

test("a capability or feature reaching durable fails", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/cap-browser/package.json": manifest("@evoharness/cap-browser", {
			"@evoharness/capability": "0.0.2",
			"@evoharness/durable": "0.0.2",
		}),
		"packages/feature-proactive/package.json": manifest("@evoharness/feature-proactive", {
			"@evoharness/durable": "0.0.2",
		}),
	});
	const result = await run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /@evoharness\/cap-browser must not depend on @evoharness\/durable/);
	assert.match(result.stderr, /@evoharness\/feature-proactive must not depend on @evoharness\/durable/);
});

test("a built-in that declares no ceiling fails, naming the tool and its file", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/coding-agent/src/core/tools/index.ts": toolsBarrel,
		"packages/coding-agent/src/core/tools/read.ts": builtInFile(false),
	});
	const result = await run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /built-in tool "read" \(packages\/coding-agent\/src\/core\/tools\/read\.ts\) declares no permissions/);
});

test("a built-in that declares its ceiling passes rule 4", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/coding-agent/src/core/tools/index.ts": toolsBarrel,
		"packages/coding-agent/src/core/tools/read.ts": builtInFile(true),
	});
	const result = await run(root);
	assert.equal(result.status, 0, result.stderr);
});

test("an undeclared registration site must be in the ledger, and --write records it", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/coding-agent/package.json": manifest("@evoharness/coding-agent"),
		"packages/coding-agent/src/core/tools/index.ts": toolsBarrel,
		"packages/coding-agent/src/core/tools/read.ts": builtInFile(true),
		"packages/coding-agent/examples/extensions/legacy.ts": extensionWithUndeclaredTool,
	});
	const before = await run(root);
	assert.equal(before.status, 1);
	assert.match(before.stderr, /examples\/extensions\/legacy\.ts registers 1 tool\(s\) with no permissions\[\] and is not in the ledger/);

	const written = await run(root, "--write");
	assert.equal(written.status, 0, written.stderr);
	const ledger = JSON.parse(await readFile(join(root, ledgerPath), "utf8"));
	assert.equal(ledger["packages/coding-agent/examples/extensions/legacy.ts"], 1);
	assert.equal((await run(root)).status, 0);
});

test("the ledger only shrinks: growth fails, and --write refuses it without --allow-grow", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/coding-agent/package.json": manifest("@evoharness/coding-agent"),
		"packages/coding-agent/src/core/tools/index.ts": toolsBarrel,
		"packages/coding-agent/src/core/tools/read.ts": builtInFile(true),
		"packages/coding-agent/examples/extensions/legacy.ts": extensionWithSecondRegistration,
		[ledgerPath]: JSON.stringify({ "packages/coding-agent/examples/extensions/legacy.ts": 1 }),
	});
	const check = await run(root);
	assert.equal(check.status, 1);
	assert.match(check.stderr, /grew from 1 to 2 undeclared registration\(s\); the ledger only shrinks/);

	const refused = await run(root, "--write");
	assert.equal(refused.status, 1);
	assert.match(refused.stderr, /Refusing to record growth/);

	const allowed = await run(root, "--write", "--allow-grow");
	assert.equal(allowed.status, 0, allowed.stderr);
});

test("a ledger entry whose file no longer registers undeclared is stale and fails", async (t) => {
	const root = await workspace(t, {
		"packages/capability/package.json": manifest("@evoharness/capability"),
		"packages/coding-agent/package.json": manifest("@evoharness/coding-agent"),
		"packages/coding-agent/src/core/tools/index.ts": toolsBarrel,
		"packages/coding-agent/src/core/tools/read.ts": builtInFile(true),
		[ledgerPath]: JSON.stringify({ "packages/coding-agent/examples/extensions/gone.ts": 3 }),
	});
	const result = await run(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /gone\.ts is in scripts\/capability-permissions\.baseline\.json but no longer registers/);
});
