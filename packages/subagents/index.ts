import type { ExtensionAPI } from "@evoharness/coding-agent";
import type {} from "./src/types/evoharness-runtime-compat.d.ts";
import { HERDR_HOST_MODE_ENV } from "./src/runs/shared/herdr-host-protocol.ts";
import { loadedPackageVersion, readInstalledPackageVersion } from "./src/shared/package-version.ts";

const registerExtension = process.env[HERDR_HOST_MODE_ENV] === "1"
	? (await import("./src/extension/herdr-host-bridge.ts")).default
	: process.env.EVOHARNESS_SUBAGENT_CHILD === "1"
	? undefined
	: (await import("./src/extension/index.ts")).default;

export default function registerSubagentExtension(evoharness: ExtensionAPI): void {
	const installedVersion = readInstalledPackageVersion();
	if (installedVersion !== loadedPackageVersion) {
		throw new Error(`subagents ${installedVersion} is installed, but this evoharness process still has ${loadedPackageVersion} loaded. Restart evoharness to load the update; /reload cannot replace extension modules that Node has already loaded.`);
	}
	registerExtension?.(evoharness);
}
