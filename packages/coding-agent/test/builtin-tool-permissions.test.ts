import { describe, expect, it } from "vitest";
import { allToolNames, createToolDefinition, type ToolName } from "../src/core/tools/index.ts";
import { createCodemodeToolDefinition } from "../src/extensions/codemode/tool.ts";
import { createMcpResourceToolDefinitions } from "../src/extensions/mcp/resources.ts";
import { createToolSearchToolDefinition } from "../src/extensions/tool-search/tool.ts";

/**
 * The table every policy rule is written against. A row here is a claim about what the tool can
 * affect, taken from reading its implementation: `docs/structure.md` §11 says permissions are
 * declared rather than waved through, and item 2's approval can only be checked against this.
 */
const EXPECTED = {
	read: ["fs.read"],
	grep: ["fs.read"],
	find: ["fs.read"],
	ls: ["fs.read"],
	edit: ["fs.read", "fs.write"],
	write: ["fs.read", "fs.write"],
	// The shell's other effects belong to the account it runs as, not to this declaration.
	bash: ["process.exec", "fs.scratch"],
	powershell: ["process.exec", "fs.scratch"],
} as const satisfies Record<ToolName, readonly string[]>;

describe("built-in tool declarations", () => {
	it("covers every name allToolNames lists, so a new built-in cannot ship undeclared", () => {
		expect([...allToolNames].sort()).toEqual(Object.keys(EXPECTED).sort());
	});

	for (const name of allToolNames) {
		it(`${name} declares exactly its expected ceiling`, () => {
			const definition = createToolDefinition(name, process.cwd());
			expect([...(definition.permissions ?? [])].sort()).toEqual([...EXPECTED[name]].sort());
		});
	}

	it("passes every built-in declaration through the contract's own validator", async () => {
		const { validateToolDeclaration } = await import("@evoharness/capability");
		for (const name of allToolNames) {
			const definition = createToolDefinition(name, process.cwd());
			const failures = validateToolDeclaration(definition, { kind: "builtin", path: `builtin:${name}` });
			expect(failures.map((failure) => failure.message)).toEqual([]);
		}
	});
});

describe("built-in extension declarations", () => {
	it("codemode delegates, appends to the session, and spills output; it writes no user file", () => {
		const definition = createCodemodeToolDefinition();
		expect([...(definition.permissions ?? [])].sort()).toEqual(["fs.scratch", "session.write", "tool.delegate"]);
		expect(definition.reachesTools).toBeTypeOf("function");
	});

	it("tool_search delegates without running anything", () => {
		const definition = createToolSearchToolDefinition({ tools: [] as never });
		expect(definition.permissions).toEqual(["tool.delegate"]);
		expect(definition.reachesTools?.({ query: "x" })).toBe("all");
	});

	it("MCP resource tools reach the server, and reading one can spill a binary to a temp file", () => {
		const servers = () =>
			[
				{
					name: "docs",
					hasResources: true,
					listResources: async () => [],
					readResource: async () => ({ content: [] }),
				},
			] as never;
		const definitions = createMcpResourceToolDefinitions({ exposure: "direct" as never, servers });
		expect(definitions).toHaveLength(3);
		for (const definition of definitions) {
			expect(definition.permissions).toContain("net.out");
		}
		const reading = definitions.filter((definition) => definition.name.includes("read"));
		expect(reading).toHaveLength(1);
		expect([...(reading[0]!.permissions ?? [])].sort()).toEqual(["fs.scratch", "net.out"]);
	});
});

describe("the example extension", () => {
	it("declares the ceiling it demonstrates", async () => {
		const registered: Array<{ permissions?: readonly string[] }> = [];
		const api = {
			registerTool: (tool: { permissions?: readonly string[] }) => registered.push(tool),
		} as never;
		const example = await import("../examples/extensions/permission-declaration.ts");
		example.default(api);
		expect(registered[0]!.permissions).toEqual(["fs.read"]);
	});
});
