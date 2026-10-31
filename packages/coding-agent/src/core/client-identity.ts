import { type ClientIdentity, PI_ATTRIBUTION } from "@evoharness/ai";
import { VERSION } from "../config.ts";
import type { SettingsManager } from "./settings-manager.ts";
import { isInstallTelemetryEnabled } from "./telemetry.ts";

/**
 * How evoharness's requests identify it to providers: a detailed `User-Agent` with evoharness's version, and attribution to evoharness as a
 * CLI agent while install telemetry is enabled.
 */
export function getClientIdentity(settingsManager: SettingsManager): ClientIdentity {
	return {
		userAgent: "detailed",
		version: VERSION,
		attribution: isInstallTelemetryEnabled(settingsManager) ? PI_ATTRIBUTION : null,
	};
}
