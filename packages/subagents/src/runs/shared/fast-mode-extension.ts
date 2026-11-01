import type { BeforeProviderRequestEvent, ExtensionAPI } from "@evoharness/coding-agent";

export function rewriteFastModeProviderRequest(event: BeforeProviderRequestEvent): unknown {
	if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return event.payload;
	return { ...event.payload, service_tier: "priority" };
}

export default function registerSubagentFastModeExtension(evoharness: ExtensionAPI): void {
	evoharness.on("before_provider_request", rewriteFastModeProviderRequest);
}
