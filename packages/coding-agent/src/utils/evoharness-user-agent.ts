import { formatUserAgent } from "@evoharness/ai";

/** evoharness's `User-Agent` for its own network requests; the same detailed form evoharness-ai sends to providers. */
export function getEvoharnessUserAgent(version: string): string {
	return formatUserAgent({ userAgent: "detailed", version });
}
