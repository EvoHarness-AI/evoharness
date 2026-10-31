import * as bundledPiAgentCore from "@evoharness/agent-core";
import * as bundledPiAiCompat from "@evoharness/ai/compat";
import * as bundledPiAiModels from "@evoharness/ai/models";
import * as bundledPiAiOauth from "@evoharness/ai/oauth";
import * as bundledPiAiProviders from "@evoharness/ai/providers/all";
import * as bundledPiTui from "@evoharness/tui";
import * as bundledTypebox from "typebox";
import * as bundledTypeboxCompile from "typebox/compile";
import * as bundledTypeboxValue from "typebox/value";
// This import is safe because loader.ts exports are not re-exported from index.ts.
// Extensions can therefore import from @evoharness/coding-agent.
import * as bundledPiCodingAgent from "../../index.ts";

/** Modules available to extensions in source and compiled binary runtimes. */
export const VIRTUAL_MODULES: Record<string, unknown> = {
	typebox: bundledTypebox,
	"typebox/compile": bundledTypeboxCompile,
	"typebox/value": bundledTypeboxValue,
	"@sinclair/typebox": bundledTypebox,
	"@sinclair/typebox/compile": bundledTypeboxCompile,
	"@sinclair/typebox/value": bundledTypeboxValue,
	"@evoharness/agent-core": bundledPiAgentCore,
	"@evoharness/tui": bundledPiTui,
	// Extensions resolve the pi-ai root to the compat entrypoint (a strict
	// superset of the core entrypoint): existing extensions using the old
	// global API keep working at runtime until compat is removed.
	"@evoharness/ai": bundledPiAiCompat,
	"@evoharness/ai/compat": bundledPiAiCompat,
	"@evoharness/ai/models": bundledPiAiModels,
	"@evoharness/ai/oauth": bundledPiAiOauth,
	"@evoharness/ai/providers/all": bundledPiAiProviders,
	"@evoharness/coding-agent": bundledPiCodingAgent,
	"@mariozechner/pi-agent-core": bundledPiAgentCore,
	"@mariozechner/pi-tui": bundledPiTui,
	"@mariozechner/pi-ai": bundledPiAiCompat,
	"@mariozechner/pi-ai/compat": bundledPiAiCompat,
	"@mariozechner/pi-ai/models": bundledPiAiModels,
	"@mariozechner/pi-ai/oauth": bundledPiAiOauth,
	"@mariozechner/pi-ai/providers/all": bundledPiAiProviders,
	"@mariozechner/pi-coding-agent": bundledPiCodingAgent,
};
