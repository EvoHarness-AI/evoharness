import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBunHostExecutable } from "../../src/runs/shared/host-spawn.ts";

for (const [argv1, execPath] of [
	["/$bunfs/root/pi-native", "/opt/standalone/pi-native"],
	["B:/~BUN/root/pi-native.exe", "C:\\Program Files\\evoharness\\pi-native.exe"],
	["B:\\~BUN\\root\\pi-native.exe", "C:\\Program Files\\evoharness\\pi-native.exe"],
])
	describe(`compiled background host detection: ${argv1}`, () => {
		const host = { execPath, argv1, bunVersion: "1.4.2", env: {} };

		it("uses the actual image even when renamed", () => {
			assert.equal(resolveBunHostExecutable(host), host.execPath);
		});

		it("honors a nonempty override, otherwise retaining the actual image", () => {
			assert.equal(
				resolveBunHostExecutable({ ...host, env: { EVOHARNESS_SUBAGENT_HOST_BINARY: " /custom/evoharness " } }),
				"/custom/evoharness",
			);
			assert.equal(
				resolveBunHostExecutable({ ...host, env: { EVOHARNESS_SUBAGENT_HOST_BINARY: " " } }),
				host.execPath,
			);
		});

		it("does not treat an ordinary Bun script or Node as a compiled host", () => {
			for (const entry of [
				"",
				"/work/script.ts",
				"B:/work/script.ts",
				"/$bunfs-other/evoharness",
				"B:/~BUN-other/evoharness.exe",
				"C:/~BUN/root/evoharness.exe",
				"/work/B:/~BUN/evoharness.exe",
			]) {
				assert.equal(resolveBunHostExecutable({ ...host, argv1: entry }), undefined, entry);
			}
			assert.equal(resolveBunHostExecutable({ ...host, bunVersion: "" }), undefined);
		});
	});
