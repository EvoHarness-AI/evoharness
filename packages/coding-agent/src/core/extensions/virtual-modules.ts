import * as bundledEvoharnessAgentCore from "@evoharness/agent-core";
import * as bundledEvoharnessAiCompat from "@evoharness/ai/compat";
import * as bundledEvoharnessAiModels from "@evoharness/ai/models";
import * as bundledEvoharnessAiOauth from "@evoharness/ai/oauth";
import * as bundledEvoharnessAiProviders from "@evoharness/ai/providers/all";
import * as bundledEvoharnessTui from "@evoharness/tui";
import * as bundledTypebox from "typebox";
import * as bundledTypeboxCompile from "typebox/compile";
import * as bundledTypeboxValue from "typebox/value";
// This import is safe because loader.ts exports are not re-exported from index.ts.
// Extensions can therefore import from @evoharness/coding-agent.
import * as bundledEvoharnessCodingAgent from "../../index.ts";

/** Modules available to extensions in source and compiled binary runtimes. */
export const VIRTUAL_MODULES: Record<string, unknown> = {
	typebox: bundledTypebox,
	"typebox/compile": bundledTypeboxCompile,
	"typebox/value": bundledTypeboxValue,
	"@sinclair/typebox": bundledTypebox,
	"@sinclair/typebox/compile": bundledTypeboxCompile,
	"@sinclair/typebox/value": bundledTypeboxValue,
	"@evoharness/agent-core": bundledEvoharnessAgentCore,
	"@evoharness/tui": bundledEvoharnessTui,
	// Extensions resolve the evoharness-ai root to the compat entrypoint (a strict
	// superset of the core entrypoint): existing extensions using the old
	// global API keep working at runtime until compat is removed.
	"@evoharness/ai": bundledEvoharnessAiCompat,
	"@evoharness/ai/compat": bundledEvoharnessAiCompat,
	"@evoharness/ai/models": bundledEvoharnessAiModels,
	"@evoharness/ai/oauth": bundledEvoharnessAiOauth,
	"@evoharness/ai/providers/all": bundledEvoharnessAiProviders,
	"@evoharness/coding-agent": bundledEvoharnessCodingAgent,
};
