import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, isPermissionId, PERMISSION_SCHEMA_VERSION } from "../src/index.ts";

describe("permission vocabulary", () => {
	it("holds every id exactly once, in the order the error message lists them", () => {
		expect([...ALL_PERMISSIONS].sort()).toEqual([
			"fs.read",
			"fs.scratch",
			"fs.write",
			"net.out",
			"process.exec",
			"session.write",
			"tool.delegate",
			"ui.interact",
		]);
		expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
	});

	it("recognizes only exact ids", () => {
		expect(isPermissionId("fs.read")).toBe(true);
		expect(isPermissionId("FS.READ")).toBe(false);
		expect(isPermissionId("fs.read.all")).toBe(false);
		expect(isPermissionId("")).toBe(false);
		expect(isPermissionId(undefined)).toBe(false);
		expect(isPermissionId({ id: "fs.read" })).toBe(false);
	});

	it("starts at schema version 1 so stored rules have something to compare against", () => {
		expect(PERMISSION_SCHEMA_VERSION).toBe(1);
	});
});
