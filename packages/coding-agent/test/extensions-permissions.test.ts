import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { loadExtensions } from "../src/core/extensions/loader.ts";
import { ExtensionRunner } from "../src/core/extensions/runner.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { createInMemoryModelRegistry } from "./model-runtime-test-utils.ts";

/**
 * The contract as an extension author meets it: registration either accepts a declaration or names
 * the extension that made it. Undeclared is allowed and means unknown, which is the strictest case
 * for whoever reads the declaration later; see packages/capability/README.md.
 */
describe("tool permission declarations at registration", () => {
	let tempDir: string;
	let extensionsDir: string;
	let sessionManager: SessionManager;
	let modelRegistry: Awaited<ReturnType<typeof createInMemoryModelRegistry>>;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evoharness-permissions-test-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
		sessionManager = SessionManager.inMemory();
		modelRegistry = await createInMemoryModelRegistry(AuthStorage.inMemory());
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	function writeExtension(fileName: string, body: string): string {
		const extensionPath = path.join(extensionsDir, fileName);
		fs.writeFileSync(
			extensionPath,
			`import { Type } from "typebox";
export default function(evoharness) {
${body}
}`,
		);
		return extensionPath;
	}

	const tool = (name: string, extra: string) => `	evoharness.registerTool({
		name: "${name}",
		label: "${name}",
		description: "${name} under test",
		parameters: Type.Object({}),
		${extra}
		execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
	});`;

	it("refuses a permission id outside the vocabulary and names the extension that claimed it", async () => {
		const extensionPath = writeExtension("unknown.ts", tool("leak", `permissions: ["net.oout"],`));

		const result = await loadExtensions([extensionPath], tempDir);

		expect(result.extensions).toHaveLength(0);
		expect(result.errors[0]!.error).toContain('unknown permission "net.oout"');
		expect(result.errors[0]!.error).toContain("leak");
		expect(result.errors[0]!.path).toBe(extensionPath);
	});

	it("refuses a repeated id rather than deduplicating it quietly", async () => {
		const extensionPath = writeExtension("duplicate.ts", tool("twice", `permissions: ["fs.read", "fs.read"],`));

		const result = await loadExtensions([extensionPath], tempDir);

		expect(result.extensions).toHaveLength(0);
		expect(result.errors[0]!.error).toContain('permission "fs.read" more than once');
	});

	it("refuses a delegation claim that never says what it can reach", async () => {
		const extensionPath = writeExtension("empty-delegation.ts", tool("bossy", `permissions: ["tool.delegate"],`));

		const result = await loadExtensions([extensionPath], tempDir);

		expect(result.extensions).toHaveLength(0);
		expect(result.errors[0]!.error).toContain("without reachesTools");
	});

	it("loads a tool that declares nothing, keeping its reach unknown instead of assuming read-only", async () => {
		const extensionPath = writeExtension("undeclared.ts", tool("legacy_tool", ""));

		const result = await loadExtensions([extensionPath], tempDir);
		const runner = new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);

		expect(result.errors).toEqual([]);
		expect(runner.getToolDefinition("legacy_tool")?.permissions).toBeUndefined();
	});

	it("refuses a re-registration that widens what the same tool already claimed", async () => {
		const extensionPath = writeExtension(
			"widening.ts",
			[
				tool("growing_tool", `permissions: ["fs.read"],`),
				tool("growing_tool", `permissions: ["fs.read", "fs.write"],`),
			].join("\n"),
		);

		const result = await loadExtensions([extensionPath], tempDir);

		expect(result.extensions).toHaveLength(0);
		expect(result.errors[0]!.error).toContain("wider permissions");
		expect(result.errors[0]!.error).toContain("fs.write");
	});

	it("accepts a re-registration that narrows the ceiling", async () => {
		const extensionPath = writeExtension(
			"narrowing.ts",
			[
				tool("shrinking_tool", `permissions: ["fs.read", "fs.write"],`),
				tool("shrinking_tool", `permissions: ["fs.read"],`),
			].join("\n"),
		);

		const result = await loadExtensions([extensionPath], tempDir);
		const runner = new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);

		expect(result.errors).toEqual([]);
		expect(runner.getToolDefinition("shrinking_tool")?.permissions).toEqual(["fs.read"]);
	});
});
