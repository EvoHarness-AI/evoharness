import { describe, expect, it } from "vitest";
import {
	collectCustomTools,
	mergeCustomDefinitions,
	ownerKindOf,
	widenedPermissions,
} from "../src/core/extensions/tool-permissions.ts";
import type { RegisteredTool, ToolDefinition } from "../src/core/extensions/types.ts";
import { createSyntheticSourceInfo, type SourceInfo } from "../src/core/source-info.ts";

const builtin = createSyntheticSourceInfo("builtin:bash", { source: "builtin" });
const sdk = createSyntheticSourceInfo("<sdk:echo>", { source: "sdk" });
const extension = createSyntheticSourceInfo("/ext/a.ts", { source: "local" });

function definition(name: string, permissions?: string[]): ToolDefinition {
	return {
		name,
		label: name,
		description: `${name} for tests`,
		parameters: { type: "object", properties: {} },
		...(permissions ? { permissions } : {}),
		execute: async () => ({ content: [], details: undefined }),
	} as unknown as ToolDefinition;
}

function registered(tool: ToolDefinition, sourceInfo = extension): RegisteredTool {
	return { definition: tool, sourceInfo };
}

function merge(
	tools: readonly RegisteredTool[],
	builtIns = new Map([["bash", definition("bash", ["process.exec", "fs.scratch"])] as const]),
) {
	const registry = new Map<string, { definition: ToolDefinition; sourceInfo: SourceInfo }>();
	const reports: Array<{ error: string; path: string }> = [];
	const accepted = mergeCustomDefinitions(registry, builtIns, tools, (error, path) => reports.push({ error, path }));
	return { registry, reports, accepted };
}

describe("mergeCustomDefinitions", () => {
	it("keeps a custom tool that declares a valid ceiling", () => {
		const { registry, reports, accepted } = merge([registered(definition("forecast", ["net.out"]))]);
		expect(registry.has("forecast")).toBe(true);
		expect(accepted.map((tool) => tool.definition.name)).toEqual(["forecast"]);
		expect(reports).toEqual([]);
	});

	it("keeps a replacement of a built-in name but reports both ceilings, so it is not silent", () => {
		const { registry, reports, accepted } = merge([registered(definition("bash", ["fs.read"]))]);
		expect(registry.get("bash")!.definition.permissions).toEqual(["fs.read"]);
		expect(accepted).toHaveLength(1);
		expect(reports[0]!.error).toContain("replaces the built-in");
		expect(reports[0]!.error).toContain("process.exec, fs.scratch");
		expect(reports[0]!.error).toContain("fs.read");
		expect(reports[0]!.path).toBe("/ext/a.ts");
	});

	it("names an undeclared replacement as unknown instead of printing an empty ceiling", () => {
		const { reports } = merge([registered(definition("bash"))]);
		expect(reports[0]!.error).toContain("undeclared (unknown, treated as the strictest case)");
	});

	it("reports an unknown permission id instead of registering the tool", () => {
		const { registry, reports } = merge([registered(definition("odd", ["net.oout"]))], new Map());
		expect(registry.size).toBe(0);
		expect(reports[0]!.error).toContain('unknown permission "net.oout"');
	});

	it("lets an undeclared tool through, because undeclared means unknown and not harmless", () => {
		const { registry, reports, accepted } = merge([registered(definition("legacy"))]);
		expect(registry.has("legacy")).toBe(true);
		expect(accepted).toHaveLength(1);
		expect(reports).toEqual([]);
		expect(registry.get("legacy")!.definition.permissions).toBeUndefined();
	});
});

describe("collectCustomTools", () => {
	it("puts extension registrations before SDK tools and tags the SDK ones", () => {
		const tools = collectCustomTools([registered(definition("from_ext"))], [definition("from_sdk")], () => true);
		expect(tools.map((tool) => tool.definition.name)).toEqual(["from_ext", "from_sdk"]);
		expect(tools[1]!.sourceInfo.path).toBe("<sdk:from_sdk>");
		expect(tools[1]!.sourceInfo.source).toBe("sdk");
	});

	it("drops names the session is not allowed to use", () => {
		const tools = collectCustomTools(
			[registered(definition("kept")), registered(definition("dropped"))],
			[],
			(name) => name !== "dropped",
		);
		expect(tools.map((tool) => tool.definition.name)).toEqual(["kept"]);
	});
});

describe("widenedPermissions", () => {
	it("names only the permissions a re-registration adds", () => {
		expect(widenedPermissions(["fs.read"], ["fs.read", "fs.write"])).toEqual(["fs.write"]);
		expect(widenedPermissions(["fs.read", "fs.write"], ["fs.read"])).toEqual([]);
		expect(widenedPermissions(["fs.read"], ["fs.read"])).toEqual([]);
	});

	it("does not treat an undeclared predecessor as permission to widen", () => {
		expect(widenedPermissions(undefined, ["fs.write"])).toEqual([]);
		expect(widenedPermissions(["fs.write"], undefined)).toEqual([]);
	});
});

describe("ownerKindOf", () => {
	it("keeps SDK provenance separate from local extension provenance", () => {
		expect(ownerKindOf("sdk")).toBe("sdk");
		expect(ownerKindOf("local")).toBe("extension");
		expect(ownerKindOf("package")).toBe("extension");
		expect(ownerKindOf(builtin.source)).toBe("extension");
		expect(sdk.source).toBe("sdk");
	});
});
