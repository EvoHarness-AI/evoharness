import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveAsyncByDefault } from "../../src/extension/config.ts";
import {
	CODING_AGENT_PACKAGE_ROOT_ENV,
	getConfigDirName,
	resolveConfigDirName,
	resolveWatchPath,
} from "../../src/shared/utils.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let previousPackageRootEnv: string | undefined;

describe("config directory resolution", () => {
	beforeEach(() => {
		previousPackageRootEnv = process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
		delete process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
	});

	afterEach(() => {
		if (previousPackageRootEnv === undefined) delete process.env[CODING_AGENT_PACKAGE_ROOT_ENV];
		else process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = previousPackageRootEnv;
	});

	it("falls back without importing the evoharness peer package at runtime", () => {
		assert.equal(resolveConfigDirName(), ".evoharness");
		assert.equal(getConfigDirName(), ".evoharness");
	});

	it("honors an explicitly provided evoharness module shape", () => {
		assert.equal(resolveConfigDirName({ CONFIG_DIR_NAME: ".custom-evoharness" }), ".custom-evoharness");
		assert.equal(resolveConfigDirName({ CONFIG_DIR_NAME: "" }), ".evoharness");
	});

	it("honors evoharness package metadata without importing the peer package", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-config-dir-"));
		try {
			const packageRoot = path.join(tempDir, "coding-agent");
			const distDir = path.join(packageRoot, "dist");
			fs.mkdirSync(distDir, { recursive: true });
			const cliPath = path.join(distDir, "cli.js");
			fs.writeFileSync(cliPath, "", "utf-8");
			fs.writeFileSync(
				path.join(packageRoot, "package.json"),
				JSON.stringify({
					name: "@evoharness/coding-agent",
					evoharnessConfig: { configDir: ".custom-evoharness" },
				}),
				"utf-8",
			);

			assert.equal(resolveConfigDirName(undefined, cliPath), ".custom-evoharness");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("uses an explicit evoharness package root before the process entrypoint walk", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-config-root-"));
		try {
			const packageRoot = path.join(tempDir, "coding-agent-root");
			fs.mkdirSync(packageRoot, { recursive: true });
			fs.writeFileSync(
				path.join(packageRoot, "package.json"),
				JSON.stringify({
					name: "@evoharness/coding-agent",
					evoharnessConfig: { configDir: ".root-evoharness" },
				}),
				"utf-8",
			);

			assert.equal(resolveConfigDirName(undefined, undefined, packageRoot), ".root-evoharness");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("invalidates cached runtime resolution when the package root changes", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-config-cache-"));
		try {
			const firstRoot = path.join(tempDir, "first");
			const secondRoot = path.join(tempDir, "second");
			for (const [root, configDir] of [
				[firstRoot, ".first-evoharness"],
				[secondRoot, ".second-evoharness"],
			] as const) {
				fs.mkdirSync(root, { recursive: true });
				fs.writeFileSync(
					path.join(root, "package.json"),
					JSON.stringify({
						name: "@evoharness/coding-agent",
						evoharnessConfig: { configDir },
					}),
					"utf-8",
				);
			}

			process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = firstRoot;
			assert.equal(getConfigDirName(), ".first-evoharness");
			assert.equal(getConfigDirName(), ".first-evoharness");
			process.env[CODING_AGENT_PACKAGE_ROOT_ENV] = secondRoot;
			assert.equal(getConfigDirName(), ".second-evoharness");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("resolves async launches as the default unless explicitly disabled", () => {
		assert.equal(resolveAsyncByDefault({}), true);
		assert.equal(resolveAsyncByDefault({ asyncByDefault: true }), true);
		assert.equal(resolveAsyncByDefault({ asyncByDefault: false }), false);
	});

	it("canonicalizes watcher paths and preserves the original path when native realpath fails", () => {
		assert.equal(
			resolveWatchPath("C:\\SHORT~1\\watch", () => "C:\\Long Path\\watch"),
			"C:\\Long Path\\watch",
		);
		assert.equal(
			resolveWatchPath("C:\\SHORT~1\\watch", () => {
				throw new Error("missing");
			}),
			"C:\\SHORT~1\\watch",
		);
	});

	it("does not runtime-import the coding agent peer from shared utils", () => {
		const source = fs.readFileSync(path.join(repoRoot, "src/shared/utils.ts"), "utf-8");
		assert.doesNotMatch(source, /import\s+[^;]*from\s+["']@evoharness\/coding-agent["']/);
	});
});
