import assert from "node:assert/strict";
import childProcess from "node:child_process";
import * as fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { type TestContext, test } from "node:test";
import { HOST_PEER_ALIASES } from "../../src/runs/background/runner-aliases.ts";
import { loadHostPiCodingAgent } from "../../src/runs/shared/child-session.ts";
import {
	CODING_AGENT_PACKAGE,
	getHostSpawnCommand,
	resolveHostDependencyPiPackageRoot,
	resolveHostPackageRoot,
	resolveInstalledHostPackageRoot,
} from "../../src/runs/shared/host-spawn.ts";
import { CODING_AGENT_PACKAGE_ROOT_ENV } from "../../src/shared/utils.ts";

function writePackage(root: string, name = CODING_AGENT_PACKAGE, owner = "host"): void {
	fs.mkdirSync(root, { recursive: true });
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({
			name,
			type: "module",
			exports: { ".": { import: "./index.mjs" } },
			bin: { evoharness: "./cli.mjs" },
		}),
	);
	fs.writeFileSync(path.join(root, "index.mjs"), `export const owner = ${JSON.stringify(owner)};\n`);
	fs.writeFileSync(path.join(root, "cli.mjs"), "export {};\n");
}

function link(target: string, entry: string): void {
	fs.mkdirSync(path.dirname(entry), { recursive: true });
	fs.symlinkSync(target, entry, "junction");
}

function fixture(t: TestContext, layout: "npm" | "pnpm" = "npm") {
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "subagents-host dependency-")));
	const previousArgv = process.argv[1];
	const previousRoot = process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
	t.after(() => {
		process.argv[1] = previousArgv;
		if (previousRoot === undefined) delete process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
		else process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = previousRoot;
		fs.rmSync(tmp, { recursive: true, force: true });
	});
	delete process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
	const host =
		layout === "npm"
			? path.join(tmp, "host app")
			: path.join(tmp, "store", "links", "host", "node_modules", "@jmfederico", "subagents-web");
	writePackage(host, "@jmfederico/pi-web", "not-evoharness");
	fs.mkdirSync(path.join(host, "dist"));
	fs.writeFileSync(path.join(host, "dist", "sessiond.mjs"), "throw new Error('host must not execute');\n");
	const dependency = path.join(host, "node_modules", CODING_AGENT_PACKAGE);
	const evoharness =
		layout === "npm"
			? dependency
			: path.join(tmp, "store", "links", "evoharness", "node_modules", CODING_AGENT_PACKAGE);
	writePackage(evoharness);
	let entry = path.join(host, "dist", "sessiond.mjs");
	if (layout === "pnpm") {
		// pnpm's scoped sibling dependency and the launcher's host junction both need realpath semantics.
		link(evoharness, path.join(path.dirname(path.dirname(host)), CODING_AGENT_PACKAGE));
		const launcherHost = path.join(tmp, "global", "node_modules", "@jmfederico", "subagents-web");
		link(host, launcherHost);
		entry = path.join(launcherHost, "dist", "sessiond.mjs");
		// The launcher's logical tree must not win over the canonical host's own dependency.
		writePackage(
			path.join(tmp, "global", "node_modules", CODING_AGENT_PACKAGE),
			CODING_AGENT_PACKAGE,
			"launcher-decoy",
		);
	}
	process.argv[1] = entry;
	return { tmp, host, evoharness, entry };
}

function writePeers(evoharness: string): void {
	const packages = new Map<string, Record<string, { import: string }>>();
	for (const { pkg, subpath } of HOST_PEER_ALIASES) {
		if (pkg === CODING_AGENT_PACKAGE) continue;
		const exports = packages.get(pkg) ?? {};
		exports[subpath] = { import: `./${subpath === "." ? "index" : subpath.slice(2).replaceAll("/", "-")}.mjs` };
		packages.set(pkg, exports);
	}
	for (const [name, exports] of packages) {
		const dir = path.join(evoharness, "node_modules", name);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, exports }));
		for (const { import: target } of Object.values(exports)) fs.writeFileSync(path.join(dir, target), "export {};\n");
	}
}

let launchId = 0;
async function captureBackground(t: TestContext, tmp: string) {
	const spawn = t.mock.method(childProcess, "spawn", () => {
		throw new Error("spawn boundary captured");
	});
	syncBuiltinESMExports();
	try {
		const { makeAgent } = await import("../support/helpers.ts");
		const modulePromise = import(`../../src/runs/background/async-execution.ts?host-dependency=${++launchId}`);
		await assert.doesNotReject(modulePromise, "background module import must not require a working SDK");
		const { executeAsyncSingle } = await modulePromise;
		const result = await executeAsyncSingle(`host-dependency-${launchId}`, {
			agent: "worker",
			task: "Check discovery",
			agentConfig: makeAgent("worker"),
			ctx: { evoharness: { events: { emit() {} } }, cwd: tmp, currentSessionId: "host-dependency" },
			artifactConfig: {
				enabled: false,
				includeInput: false,
				includeOutput: false,
				includeJsonl: false,
				includeMetadata: false,
				cleanupDays: 7,
			},
			shareEnabled: false,
			sessionRoot: path.join(tmp, "sessions"),
			maxSubagentDepth: 1,
			acceptance: false,
		});
		return { result, calls: [...spawn.mock.calls] };
	} finally {
		spawn.mock.restore();
		syncBuiltinESMExports();
	}
}

async function assertBackgroundFailure(t: TestContext, tmp: string, expected: RegExp) {
	const { result, calls } = await captureBackground(t, tmp);
	assert.equal(result.isError, true);
	assert.match(result.content[0]!.text, expected);
	assert.equal(calls.length, 0, "invalid selected SDK must fail before spawn");
}

for (const layout of ["npm", "pnpm"] as const) {
	test(`host-relative ${layout} import-only SDK agrees across foreground, CLI and detached peer preload`, async (t) => {
		const { tmp, evoharness, entry } = fixture(t, layout);
		writePeers(evoharness);
		assert.throws(() => createRequire(fs.realpathSync(entry)).resolve(CODING_AGENT_PACKAGE), {
			code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		});
		assert.notEqual(resolveInstalledHostPackageRoot(), evoharness, "the extension has a competing installed SDK");
		assert.equal(resolveHostDependencyPiPackageRoot(), evoharness);
		assert.equal(resolveHostPackageRoot(), evoharness);
		const sdk = (await loadHostPiCodingAgent()) as { owner?: string };
		assert.equal(sdk.owner, "host");
		for (const platform of ["win32", "linux", "darwin"] as const) {
			assert.deepEqual(getHostSpawnCommand(["--version"], { platform, env: {} }), {
				command: process.execPath,
				args: [path.join(evoharness, "cli.mjs"), "--version"],
			});
		}
		const { result, calls } = await captureBackground(t, tmp);
		assert.match(result.content[0]!.text, /spawn boundary captured/);
		assert.equal(calls.length, 1);
		const options = calls[0]!.arguments[2];
		assert.equal(options.env[CODING_AGENT_PACKAGE_ROOT_ENV], evoharness);
		assert.equal(options.env.EVOHARNESS_PACKAGE_DIR, evoharness);
		const aliases = JSON.parse(options.env.JITI_ALIAS);
		assert.equal(aliases[CODING_AGENT_PACKAGE], path.join(evoharness, "index.mjs"));
		// Execute only the peer preload in an isolated process, not a real agent or daemon.
		const loaded = childProcess.spawnSync(
			process.execPath,
			[
				"--import",
				new URL("../../runner-peer-preload.mjs", import.meta.url).href,
				"--input-type=module",
				"-e",
				`import { owner } from '${CODING_AGENT_PACKAGE}'; console.log(owner);`,
			],
			{ cwd: tmp, env: options.env, encoding: "utf8" },
		);
		assert.equal(loaded.status, 0, loaded.stderr);
		assert.equal(loaded.stdout.trim(), "host");
	});
}

test("an extensionless .bin/evoharness symlink honors the override across SDK, CLI and background", async (t) => {
	const { tmp, evoharness } = fixture(t);
	const bin = path.join(tmp, "node_modules", ".bin", "evoharness");
	fs.mkdirSync(path.dirname(bin), { recursive: true });
	try {
		fs.symlinkSync(path.join(evoharness, "cli.mjs"), bin, "file");
	} catch (error) {
		if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") {
			t.skip("file symlinks require elevated privileges on Windows");
			return;
		}
		throw error;
	}
	process.argv[1] = bin;
	const override = path.join(tmp, "override");
	writePackage(override, CODING_AGENT_PACKAGE, "override");
	writePeers(override);
	process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = override;
	assert.equal(resolveHostPackageRoot(), override);
	assert.equal(((await loadHostPiCodingAgent()) as { owner?: string }).owner, "override");
	assert.equal(resolveHostPackageRoot({ hostPackageRoot: evoharness }), evoharness);
	assert.equal(getHostSpawnCommand([], { hostPackageRoot: evoharness }).args[0], path.join(evoharness, "cli.mjs"));
	for (const platform of ["linux", "darwin", "win32"] as const) {
		assert.equal(getHostSpawnCommand([], { platform }).args[0], path.join(override, "cli.mjs"));
	}
	const { calls } = await captureBackground(t, tmp);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]!.arguments[2].env.EVOHARNESS_PACKAGE_DIR, override);

	fs.writeFileSync(path.join(override, "package.json"), "{");
	assert.throws(() => resolveHostPackageRoot(), /malformed JSON/);
	await assert.rejects(loadHostPiCodingAgent(), /malformed JSON/);
	assert.throws(() => getHostSpawnCommand([]), /malformed JSON/);
	await assertBackgroundFailure(t, tmp, /malformed JSON/);

	delete process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
	assert.equal(resolveHostPackageRoot(), evoharness);
	assert.equal(((await loadHostPiCodingAgent()) as { owner?: string }).owner, "host");
	assert.equal(getHostSpawnCommand([]).args[0], path.join(evoharness, "cli.mjs"));
});

test("injected roots share SDK and CLI precedence and fail closed without installed fallback", (t) => {
	const { tmp, evoharness, entry } = fixture(t);
	const injected = path.join(tmp, "injected");
	const override = path.join(tmp, "override");
	writePackage(injected);
	writePackage(override);
	let fallbackCalls = 0;
	const deps = {
		argv1: entry,
		hostPackageRoot: ` ${injected} `,
		env: { [CODING_AGENT_PACKAGE_ROOT_ENV]: override },
		resolvePackageJson: () => {
			fallbackCalls++;
			return path.join(evoharness, "package.json");
		},
	};
	assert.equal(resolveHostPackageRoot(deps), injected);
	assert.equal(getHostSpawnCommand([], deps).args[0], path.join(injected, "cli.mjs"));
	assert.equal(resolveHostPackageRoot({ ...deps, hostPackageRoot: " " }), override);
	assert.equal(getHostSpawnCommand([], { ...deps, hostPackageRoot: " " }).args[0], path.join(override, "cli.mjs"));
	fs.writeFileSync(path.join(injected, "package.json"), "{");
	assert.throws(() => resolveHostPackageRoot(deps), /malformed JSON/);
	assert.throws(() => getHostSpawnCommand([], deps), /malformed JSON/);
	assert.equal(fallbackCalls, 0, "selected roots must not probe an installed fallback");
});

test("SDK and CLI share the extension-relative fallback when the host is unavailable", (t) => {
	const { tmp } = fixture(t);
	const installed = path.join(tmp, "extension-install");
	writePackage(installed);
	const deps = {
		argv1: path.join(tmp, "missing-host.mjs"),
		env: {},
		resolvePackageJson: () => path.join(installed, "package.json"),
	};
	assert.equal(resolveHostPackageRoot(deps), installed);
	assert.equal(getHostSpawnCommand([], deps).args[0], path.join(installed, "cli.mjs"));
});

test("an invalid host dependency manifest fails closed instead of falling back", (t) => {
	const { evoharness } = fixture(t);
	for (const [manifest, expected] of [
		["{", /malformed JSON/],
		[JSON.stringify({ name: "not-evoharness" }), /expected "@evoharness\/coding-agent"/],
		["null", /expected a JSON object/],
	] as const) {
		fs.writeFileSync(path.join(evoharness, "package.json"), manifest);
		assert.throws(() => resolveHostPackageRoot(), expected);
	}
});

test("selected host SDK missing entry, blocked export and import errors never load the extension SDK", async (t) => {
	const { tmp, evoharness } = fixture(t);
	writePeers(evoharness);
	fs.unlinkSync(path.join(evoharness, "index.mjs"));
	await assert.rejects(loadHostPiCodingAgent(), /ENOENT/);
	let background = await captureBackground(t, tmp);
	assert.equal(background.calls.length, 0);
	assert.match(background.result.content[0]!.text, /does not provide @evoharness\/coding-agent/);
	fs.writeFileSync(
		path.join(evoharness, "package.json"),
		JSON.stringify({ name: CODING_AGENT_PACKAGE, exports: { ".": null } }),
	);
	await assert.rejects(loadHostPiCodingAgent(), /no resolvable root export/);
	background = await captureBackground(t, tmp);
	assert.equal(background.calls.length, 0);
	writePackage(evoharness);
	fs.writeFileSync(path.join(evoharness, "index.mjs"), "import 'missing-host-sdk-dependency';\n");
	await assert.rejects(loadHostPiCodingAgent(), /missing-host-sdk-dependency/);
	fs.unlinkSync(path.join(evoharness, "cli.mjs"));
	assert.throws(() => getHostSpawnCommand([], { platform: "linux" }), /no runnable CLI script/);
});

test("missing host argv falls back to the extension install, and blank override does not mask the host", (t) => {
	const { evoharness, tmp } = fixture(t);
	process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = "   ";
	assert.equal(resolveHostPackageRoot(), evoharness);
	process.argv[1] = path.join(tmp, "missing.mjs");
	assert.equal(resolveHostDependencyPiPackageRoot(), undefined);
	assert.equal(resolveHostPackageRoot(), resolveInstalledHostPackageRoot());
	delete process.argv[1];
	assert.equal(resolveHostDependencyPiPackageRoot(), undefined);
});

test("a broken nearest host dependency does not select a hoisted or extension copy", async (t) => {
	const { tmp, host, evoharness } = fixture(t);
	fs.rmSync(evoharness, { recursive: true });
	const target = path.join(tmp, "removed-package");
	writePackage(target);
	link(target, evoharness);
	fs.rmSync(target, { recursive: true });
	writePackage(path.join(tmp, "node_modules", CODING_AGENT_PACKAGE), CODING_AGENT_PACKAGE, "hoisted-decoy");
	assert.ok(fs.existsSync(path.join(host, "dist", "sessiond.mjs")));
	assert.throws(() => resolveHostPackageRoot(), /ENOENT/);
	await assert.rejects(loadHostPiCodingAgent(), /ENOENT/);
	assert.throws(() => getHostSpawnCommand([]), /ENOENT/);
	await assertBackgroundFailure(t, tmp, /ENOENT/);
});

test("a file named node_modules does not stop the host dependency walk", (t) => {
	const { host, evoharness } = fixture(t);
	fs.writeFileSync(path.join(host, "dist", "node_modules"), "stray");
	assert.equal(resolveHostDependencyPiPackageRoot(), evoharness);
});

test("a Pi-owned entry reached through a directory junction still outranks a broken override", async (t) => {
	const { tmp, evoharness } = fixture(t);
	const launcher = path.join(tmp, "subagents-launcher");
	link(evoharness, launcher);
	process.argv[1] = path.join(launcher, "cli.mjs");
	process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = path.join(tmp, "absent-override");
	assert.equal(resolveHostPackageRoot(), evoharness);
	assert.equal(((await loadHostPiCodingAgent()) as { owner?: string }).owner, "host");
	assert.equal(getHostSpawnCommand([]).args[0], path.join(evoharness, "cli.mjs"));
});
