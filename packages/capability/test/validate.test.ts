import { describe, expect, it } from "vitest";
import {
	type Capability,
	declaredPermissions,
	formatDeclarationFailures,
	validateCapability,
	validateToolDeclaration,
} from "../src/index.ts";

const extension = { kind: "extension", path: "/ext/weather.ts" } as const;
const builtin = { kind: "builtin", path: "builtin:bash" } as const;
const sdk = { kind: "sdk", path: "<sdk:echo>" } as const;

describe("validateToolDeclaration", () => {
	it("rejects an unknown id, naming the tool, the id, and who registered it", () => {
		const failures = validateToolDeclaration({ name: "web_fetch", permissions: ["net.oout"] }, extension);
		expect(failures.map((failure) => failure.code)).toEqual(["unknown-permission"]);
		expect(failures[0]!.message).toContain("web_fetch");
		expect(failures[0]!.message).toContain("net.oout");
		expect(failures[0]!.message).toContain("/ext/weather.ts");
	});

	it("rejects a repeated id instead of quietly deduplicating it", () => {
		const failures = validateToolDeclaration({ name: "read", permissions: ["fs.read", "fs.read"] }, extension);
		expect(failures.map((failure) => failure.code)).toEqual(["duplicate-permission"]);
	});

	it("rejects non-strings and empty strings with the offending index", () => {
		const failures = validateToolDeclaration({ name: "odd", permissions: ["fs.read", "", 7, null] }, extension);
		expect(failures.map((failure) => failure.message)).toEqual([
			expect.stringContaining("permissions[1]"),
			expect.stringContaining("permissions[2]"),
			expect.stringContaining("permissions[3]"),
		]);
		expect(failures.every((failure) => failure.code === "malformed-permissions")).toBe(true);
	});

	it("rejects a permissions value that is not an array at all", () => {
		// A JavaScript extension can reach this; the TypeScript field type will not stop it.
		const malformed = { name: "odd", permissions: "fs.read" as unknown as string[] };
		const failures = validateToolDeclaration(malformed, extension);
		expect(failures.map((failure) => failure.code)).toEqual(["malformed-permissions"]);
	});

	it("rejects a delegation claim with nothing to bound the reach", () => {
		const failures = validateToolDeclaration({ name: "runner", permissions: ["tool.delegate"] }, extension);
		expect(failures.map((failure) => failure.code)).toEqual(["delegation-without-reach"]);
	});

	it("accepts a delegation claim that declares its reach", () => {
		const failures = validateToolDeclaration(
			{ name: "codemode", permissions: ["tool.delegate"], reachesTools: () => "all" },
			extension,
		);
		expect(failures).toEqual([]);
	});

	it("treats an undeclared built-in as a hole, not as migration debt", () => {
		const failures = validateToolDeclaration({ name: "bash" }, builtin);
		expect(failures.map((failure) => failure.code)).toEqual(["missing-declaration"]);
		expect(failures[0]!.message).toContain("builtin");
	});

	it("leaves an undeclared extension or SDK tool to the ledger instead of failing", () => {
		expect(validateToolDeclaration({ name: "legacy" }, extension)).toEqual([]);
		expect(validateToolDeclaration({ name: "legacy" }, sdk)).toEqual([]);
	});

	it("reports every problem in one pass so a fixer sees the whole list", () => {
		const failures = validateToolDeclaration({ name: "both", permissions: ["nope", "nope"] }, extension);
		expect(failures).toHaveLength(2);
		expect(formatDeclarationFailures(failures)).toContain('unknown permission "nope"');
	});
});

describe("declaredPermissions", () => {
	it("keeps unknown as unknown rather than guessing read-only", () => {
		expect(declaredPermissions(undefined)).toBeUndefined();
		expect(declaredPermissions([])).toEqual([]);
	});

	it("drops ids outside the vocabulary instead of passing them to a policy reader", () => {
		expect(declaredPermissions(["fs.read", "fs.delete"])).toEqual(["fs.read"]);
	});
});

function weatherCapability(overrides: Partial<Capability> = {}): Capability {
	return {
		id: "weather",
		title: "Weather",
		tools: [
			{ name: "forecast", permissions: ["net.out"] },
			{ name: "cache", permissions: ["fs.read", "fs.scratch"] },
		],
		permissions: ["fs.read", "fs.scratch", "net.out"],
		...overrides,
	};
}

describe("validateCapability", () => {
	it("accepts a descriptor whose permissions are exactly its tools' union", () => {
		expect(validateCapability(weatherCapability())).toEqual([]);
	});

	it("rejects a capability that understates what its own tools reach", () => {
		const failures = validateCapability(weatherCapability({ permissions: ["fs.read"] }));
		expect(failures.map((failure) => failure.code)).toEqual(["capability-understates"]);
		expect(failures[0]!.message).toContain("fs.scratch");
		expect(failures[0]!.message).toContain("net.out");
	});

	it("rejects a capability that overstates itself as gentler than its tools", () => {
		const failures = validateCapability(
			weatherCapability({ permissions: ["fs.read", "fs.scratch", "net.out", "ui.interact"] }),
		);
		expect(failures.map((failure) => failure.code)).toEqual(["capability-overstates"]);
		expect(failures[0]!.message).toContain("ui.interact");
	});

	it("accepts a tool that claims it affects nothing, because an empty ceiling is a claim", () => {
		const failures = validateCapability(
			weatherCapability({
				tools: [
					{ name: "forecast", permissions: [] },
					{ name: "cache", permissions: ["fs.read", "fs.scratch"] },
				],
				permissions: ["fs.read", "fs.scratch"],
			}),
		);
		expect(failures).toEqual([]);
	});

	it("refuses a capability tool that declared nothing at all", () => {
		const silent = { name: "forecast" } as unknown as { name: string; permissions: readonly [] };
		const failures = validateCapability(
			weatherCapability({
				tools: [silent, { name: "cache", permissions: ["fs.read", "fs.scratch"] }],
				permissions: ["fs.read", "fs.scratch"],
			}),
		);
		expect(failures.map((failure) => failure.code)).toEqual(["missing-declaration"]);
	});

	it("rejects an id that would collide once namespaces are normalized", () => {
		const failures = validateCapability(weatherCapability({ id: "web_fetch" }));
		expect(failures.map((failure) => failure.code)).toEqual(["invalid-capability-id"]);
	});

	it("rejects the same tool listed twice", () => {
		const failures = validateCapability(
			weatherCapability({
				tools: [
					{ name: "forecast", permissions: ["net.out"] },
					{ name: "forecast", permissions: ["net.out"] },
				],
				permissions: ["net.out"],
			}),
		);
		expect(failures.map((failure) => failure.code)).toEqual(["duplicate-tool-name"]);
	});
});
