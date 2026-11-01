import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { getHostSpawnCommand, type HostSpawnDeps, resolvePiCliScript } from "../../src/runs/shared/host-spawn.ts";
import { CODING_AGENT_PACKAGE_ROOT_ENV } from "../../src/shared/utils.ts";

function makeDeps(input: {
	platform?: NodeJS.Platform;
	execPath?: string;
	argv1?: string;
	existing?: string[];
	packageJsonPath?: string;
	packageJsonContent?: string;
	packageEntry?: string;
	env?: NodeJS.ProcessEnv;
}): HostSpawnDeps {
	const existing = new Set(input.existing ?? []);
	const packageJsonPath = input.packageJsonPath;
	const packageJsonContent = input.packageJsonContent;
	return {
		platform: input.platform,
		execPath: input.execPath,
		argv1: input.argv1,
		existsSync: (filePath) => existing.has(filePath),
		readFileSync: (_filePath, _encoding) => {
			if (!packageJsonPath || !packageJsonContent) {
				throw new Error("package json not configured");
			}
			return packageJsonContent;
		},
		resolvePackageJson: packageJsonPath ? () => packageJsonPath : undefined,
		resolvePackageEntry: input.packageEntry ? () => input.packageEntry! : undefined,
		env: input.env ?? {},
	};
}

describe("getHostSpawnCommand", () => {
	it("honors explicit EVOHARNESS_SUBAGENT_HOST_BINARY override on any platform", () => {
		const args = ["--mode", "json", "Task: check output"];
		const result = getHostSpawnCommand(args, {
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/tmp/pi-entry.mjs",
			env: {
				EVOHARNESS_SUBAGENT_HOST_BINARY: "/nix/store/pi-wrapper/bin/nhost-code-agent",
			},
			existsSync: () => true,
		});
		assert.deepEqual(result, {
			command: "/nix/store/pi-wrapper/bin/nhost-code-agent",
			args,
		});
	});

	for (const extension of ["js", "mjs", "cjs"] as const) {
		it(`runs a Windows ${extension} EVOHARNESS_SUBAGENT_HOST_BINARY override through Node`, () => {
			const hostBinary = `C:\\Program Files\\evoharness\\bin\\pi-cli.${extension}`;
			const args = ["--mode", "json", "Task: check output"];
			const result = getHostSpawnCommand(args, {
				platform: "win32",
				execPath: "C:\\Program Files\\nodejs\\node.exe",
				env: { EVOHARNESS_SUBAGENT_HOST_BINARY: hostBinary },
			});
			assert.deepEqual(result, {
				command: "C:\\Program Files\\nodejs\\node.exe",
				args: [hostBinary, ...args],
			});
		});
	}

	it("keeps a JavaScript EVOHARNESS_SUBAGENT_HOST_BINARY override direct on POSIX", () => {
		const hostBinary = "/opt/evoharness/bin/pi-cli.mjs";
		const args = ["--mode", "json", "Task: check output"];
		const result = getHostSpawnCommand(args, {
			platform: "darwin",
			execPath: "/usr/local/bin/node",
			env: { EVOHARNESS_SUBAGENT_HOST_BINARY: hostBinary },
		});
		assert.deepEqual(result, { command: hostBinary, args });
	});

	it("ignores a blank EVOHARNESS_SUBAGENT_HOST_BINARY override", () => {
		const args = ["--mode", "json", "Task: check output"];
		const result = getHostSpawnCommand(args, {
			platform: "darwin",
			argv1: "/missing/host.js",
			existsSync: () => false,
			resolvePackageJson: () => {
				throw new Error("evoharness package unavailable");
			},
			env: { EVOHARNESS_SUBAGENT_HOST_BINARY: "   " },
		});
		assert.deepEqual(result, { command: "evoharness", args });
	});

	for (const [platform, execPath] of [
		["darwin", "/opt/evoharness/evoharness"],
		["linux", "/opt/evoharness/evoharness"],
		["win32", "C:\\Program Files\\evoharness\\evoharness.exe"],
	] as const) {
		it(`uses the standalone evoharness executable directly on ${platform}`, () => {
			const packageJsonPath = "/opt/pi-package/package.json";
			const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli.js");
			const deps = makeDeps({
				platform,
				execPath,
				argv1: "/missing/host.js",
				packageJsonPath,
				packageJsonContent: JSON.stringify({
					name: "@evoharness/coding-agent",
					bin: { evoharness: "dist/cli.js" },
				}),
				existing: [packageJsonPath, cliPath],
			});
			const args = ["--mode", "json", "-p", "Task: review diff"];
			assert.deepEqual(getHostSpawnCommand(args, deps), {
				command: execPath,
				args,
			});
		});
	}

	for (const platform of ["darwin", "linux", "win32"] as const) {
		it(`uses node + argv1 on ${platform} when argv1 belongs to the evoharness package`, () => {
			const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "host-spawn-argv-entry-"));
			try {
				const argv1 = path.join(tempDir, "dist", "cli.js");
				fs.mkdirSync(path.dirname(argv1), { recursive: true });
				fs.writeFileSync(argv1, "#!/usr/bin/env node\n");
				fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "@evoharness/coding-agent" }));
				const args = ["--mode", "json", 'Task: review "quotes" & pipes | too'];
				const result = getHostSpawnCommand(args, {
					platform,
					execPath: "/usr/local/bin/node",
					argv1,
					env: {},
				});
				assert.deepEqual(result, {
					command: "/usr/local/bin/node",
					args: [fs.realpathSync(argv1), ...args],
				});
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	}

	it("uses node + package bin on POSIX when argv1 is not a verified evoharness entry", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "darwin",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/evoharness/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({
				name: "@evoharness/coding-agent",
				bin: { evoharness: "dist/cli/index.js" },
			}),
			existing: [packageJsonPath, cliPath],
		});
		const args = ["-p", "Task: hello"];
		const result = getHostSpawnCommand(args, deps);
		assert.deepEqual(result, {
			command: "/usr/local/bin/node",
			args: [cliPath, ...args],
		});
	});

	it("fails closed until the Windows CLI script becomes available", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		let cliAvailable = false;
		const deps = makeDeps({
			platform: "win32",
			execPath: "C:\\Program Files\\nodejs\\node.exe",
			argv1: "/opt/pi-web/dist/server.js",
			packageJsonPath,
			packageJsonContent: JSON.stringify({
				name: "@evoharness/coding-agent",
				bin: { evoharness: "dist/cli/index.js" },
			}),
			existing: [packageJsonPath],
		});
		deps.existsSync = (filePath) => filePath === packageJsonPath || (cliAvailable && filePath === cliPath);
		const args = ["-p", "Task: hello"];

		assert.throws(() => getHostSpawnCommand(args, deps), /Could not resolve the evoharness CLI on Windows/);
		cliAvailable = true;
		assert.deepEqual(getHostSpawnCommand(args, deps), {
			command: "C:\\Program Files\\nodejs\\node.exe",
			args: [cliPath, ...args],
		});
	});

	it("resolves the Windows CLI from the forwarded package-root env for wrapper hosts", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const args = ["-p", "Task: hello"];
		const result = getHostSpawnCommand(args, {
			platform: "win32",
			execPath: "C:\\Program Files\\nodejs\\node.exe",
			argv1: "/opt/pi-web/dist/server.js",
			env: { [CODING_AGENT_PACKAGE_ROOT_ENV]: "/opt/evoharness" },
			existsSync: (filePath) => filePath === packageJsonPath || filePath === cliPath,
			readFileSync: () =>
				JSON.stringify({
					name: "@evoharness/coding-agent",
					bin: { evoharness: "dist/cli/index.js" },
				}),
		});

		assert.deepEqual(result, {
			command: "C:\\Program Files\\nodejs\\node.exe",
			args: [cliPath, ...args],
		});
	});

	it("rejects an unverified forwarded package-root env instead of resolving a different evoharness package", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "host-spawn-unverified-env-root-"));
		try {
			const wrongRoot = path.join(tempDir, "not-evoharness");
			const wrongCli = path.join(wrongRoot, "bin", "evil.js");
			const piRoot = path.join(tempDir, "node_modules", "@evoharness", "coding-agent");
			const hostEntry = path.join(piRoot, "dist", "index.js");
			const piCli = path.join(piRoot, "dist", "cli.js");
			fs.mkdirSync(path.dirname(wrongCli), { recursive: true });
			fs.mkdirSync(path.dirname(piCli), { recursive: true });
			fs.writeFileSync(wrongCli, "console.log('evil');\n");
			fs.writeFileSync(
				path.join(wrongRoot, "package.json"),
				JSON.stringify({ name: "not-evoharness", bin: { evoharness: "bin/evil.js" } }),
			);
			fs.writeFileSync(hostEntry, "export {};\n");
			fs.writeFileSync(piCli, "#!/usr/bin/env node\n");
			fs.writeFileSync(
				path.join(piRoot, "package.json"),
				JSON.stringify({ name: "@evoharness/coding-agent", bin: { evoharness: "dist/cli.js" } }),
			);

			assert.throws(
				() =>
					getHostSpawnCommand(["-p", "Task: hello"], {
						platform: "win32",
						execPath: "C:\\Program Files\\nodejs\\node.exe",
						argv1: "/opt/pi-web/dist/server.js",
						env: { [CODING_AGENT_PACKAGE_ROOT_ENV]: wrongRoot },
						resolvePackageEntry: () => hostEntry,
					}),
				/expected "@evoharness\/coding-agent"/,
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("falls back to plain evoharness command on POSIX when CLI script cannot be resolved", () => {
		const args = ["--mode", "json", "Task: check output"];
		const result = getHostSpawnCommand(args, {
			platform: "darwin",
			argv1: "/missing/host.js",
			existsSync: () => false,
			resolvePackageJson: () => {
				throw new Error("evoharness package unavailable");
			},
			env: {},
		});
		assert.deepEqual(result, { command: "evoharness", args });
	});

	it("ignores embedded host entry points and resolves the evoharness package bin on every platform", () => {
		const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "host-spawn-embedded-host-")));
		try {
			const hostRoot = path.join(tempDir, "subagents-web");
			const hostEntry = path.join(hostRoot, "dist", "server.js");
			const hostPackageJson = path.join(hostRoot, "package.json");
			const piRoot = path.join(tempDir, "node_modules", "@evoharness", "coding-agent");
			const piCli = path.join(piRoot, "dist", "cli.js");
			fs.mkdirSync(path.dirname(hostEntry), { recursive: true });
			fs.mkdirSync(path.dirname(piCli), { recursive: true });
			fs.writeFileSync(hostEntry, "export {};\n");
			fs.writeFileSync(hostPackageJson, JSON.stringify({ name: "@jmfederico/pi-web" }));
			fs.writeFileSync(piCli, "#!/usr/bin/env node\n");
			fs.writeFileSync(
				path.join(piRoot, "package.json"),
				JSON.stringify({
					name: "@evoharness/coding-agent",
					bin: { evoharness: "dist/cli.js" },
				}),
			);

			for (const platform of ["darwin", "linux", "win32"] as const) {
				const result = getHostSpawnCommand(["-p", "Task: hello"], {
					platform,
					execPath: "/usr/local/bin/node",
					argv1: hostEntry,
					resolvePackageJson: () => path.join(piRoot, "package.json"),
					env: {},
				});
				assert.deepEqual(result, {
					command: "/usr/local/bin/node",
					args: [piCli, "-p", "Task: hello"],
				});
			}

			fs.writeFileSync(hostPackageJson, "{");
			for (const platform of ["darwin", "linux", "win32"] as const) {
				const malformedHostResult = getHostSpawnCommand(["-p", "Task: hello"], {
					platform,
					execPath: "/usr/local/bin/node",
					argv1: hostEntry,
					resolvePackageJson: () => path.join(piRoot, "package.json"),
					env: {},
				});
				assert.deepEqual(malformedHostResult, {
					command: "/usr/local/bin/node",
					args: [piCli, "-p", "Task: hello"],
				});
			}
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("validates argv1 ownership against its canonical target", () => {
		const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "host-spawn-canonical-entry-")));
		try {
			const hostRoot = path.join(tempDir, "embedded-host");
			const hostEntry = path.join(hostRoot, "dist", "server.js");
			const piRoot = path.join(tempDir, "node_modules", "@evoharness", "coding-agent");
			const disguisedEntry = path.join(piRoot, "dist", "cli.js");
			const piCli = path.join(piRoot, "dist", "real-cli.js");
			fs.mkdirSync(path.dirname(hostEntry), { recursive: true });
			fs.mkdirSync(path.dirname(piCli), { recursive: true });
			fs.writeFileSync(hostEntry, "export {};\n");
			fs.writeFileSync(path.join(hostRoot, "package.json"), JSON.stringify({ name: "embedded-host" }));
			fs.writeFileSync(piCli, "#!/usr/bin/env node\n");
			fs.writeFileSync(
				path.join(piRoot, "package.json"),
				JSON.stringify({
					name: "@evoharness/coding-agent",
					bin: { evoharness: "dist/real-cli.js" },
				}),
			);

			const result = getHostSpawnCommand(["-p", "Task: hello"], {
				execPath: "/usr/local/bin/node",
				argv1: disguisedEntry,
				existsSync: (filePath) => filePath === disguisedEntry || fs.existsSync(filePath),
				realpathSync: (filePath) => (filePath === disguisedEntry ? hostEntry : fs.realpathSync(filePath)),
				resolvePackageJson: () => path.join(piRoot, "package.json"),
				env: {},
			});
			assert.deepEqual(result, {
				command: "/usr/local/bin/node",
				args: [piCli, "-p", "Task: hello"],
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("resolves CLI script from package bin when argv1 is not runnable JS", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		// Compute expected path the same way the production code does:
		// path.resolve(path.dirname(packageJsonPath), binPath) — which on Windows
		// prepends the current drive letter to POSIX absolute paths.
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/evoharness/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({
				name: "@evoharness/coding-agent",
				bin: { evoharness: "dist/cli/index.js" },
			}),
			existing: [packageJsonPath, cliPath],
		});
		const result = getHostSpawnCommand(["-p", "Task: hello"], deps);
		assert.equal(result.command, "/usr/local/bin/node");
		assert.equal(result.args[0], cliPath);
	});

	it("walks from package main entry to resolve package bin", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "host-spawn-package-root-"));
		try {
			const packageRoot = path.join(tempDir, "node_modules", "@evoharness", "coding-agent");
			const entry = path.join(packageRoot, "dist", "index.js");
			const cliPath = path.join(packageRoot, "dist", "cli", "index.js");
			fs.mkdirSync(path.dirname(entry), { recursive: true });
			fs.mkdirSync(path.dirname(cliPath), { recursive: true });
			fs.writeFileSync(entry, "export {};\n");
			fs.writeFileSync(cliPath, "#!/usr/bin/env node\n");
			fs.writeFileSync(
				path.join(packageRoot, "package.json"),
				JSON.stringify({
					name: "@evoharness/coding-agent",
					bin: { evoharness: "dist/cli/index.js" },
				}),
			);
			const result = getHostSpawnCommand(["-p", "Task: hello"], {
				platform: "win32",
				execPath: "/usr/local/bin/node",
				argv1: "/opt/evoharness/subagent-runner.ts",
				resolvePackageEntry: () => entry,
				env: {},
			});
			assert.equal(result.command, "/usr/local/bin/node");
			assert.equal(result.args[0], cliPath);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("getHostSpawnCommand with hostPackageRoot", () => {
	it("resolves CLI script via hostPackageRoot when argv1 is not runnable", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/evoharness/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({
				name: "@evoharness/coding-agent",
				bin: { evoharness: "dist/cli/index.js" },
			}),
			existing: [packageJsonPath, cliPath],
		});
		deps.hostPackageRoot = "/opt/evoharness";
		const result = getHostSpawnCommand(["-p", "Task: hello"], deps);
		assert.equal(result.command, "/usr/local/bin/node");
		assert.equal(result.args[0], cliPath);
	});
});

describe("resolvePiCliScript", () => {
	it("keeps extension-relative installed CLI discovery best-effort on POSIX", () => {
		const args = ["--version"];
		const deps = makeDeps({
			platform: "linux",
			argv1: "/missing/host.js",
			packageJsonPath: "/opt/extension/node_modules/evoharness/package.json",
			packageJsonContent: "{ malformed",
		});
		assert.deepEqual(getHostSpawnCommand(args, deps), { command: "evoharness", args });
	});

	it("supports package bin as string", () => {
		const packageJsonPath = "/opt/evoharness/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.mjs");
		const deps = makeDeps({
			platform: "win32",
			argv1: "/opt/evoharness/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ name: "@evoharness/coding-agent", bin: "dist/cli/index.mjs" }),
			existing: [packageJsonPath, cliPath],
		});
		assert.equal(resolvePiCliScript(deps), cliPath);
	});
});
