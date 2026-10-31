import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export const workspaceSourcePaths = {
	chordIndex: fileURLToPath(new URL("./packages/chord/src/index.ts", import.meta.url)),
	chordContext: fileURLToPath(new URL("./packages/chord/src/context/index.ts", import.meta.url)),
	chordDelta: fileURLToPath(new URL("./packages/chord/src/delta/index.ts", import.meta.url)),
	chordNode: fileURLToPath(new URL("./packages/chord/src/node.ts", import.meta.url)),
	telemetryIndex: fileURLToPath(new URL("./packages/telemetry/src/index.ts", import.meta.url)),
	telemetryTesting: fileURLToPath(new URL("./packages/telemetry/src/testing/index.ts", import.meta.url)),
	mcpIndex: fileURLToPath(new URL("./packages/mcp/src/index.ts", import.meta.url)),
	mcpOAuth: fileURLToPath(new URL("./packages/mcp/src/oauth/index.ts", import.meta.url)),
	mcpTesting: fileURLToPath(new URL("./packages/mcp/src/testing/index.ts", import.meta.url)),
	aiIndex: fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
	aiCompat: fileURLToPath(new URL("./packages/ai/src/compat.ts", import.meta.url)),
	aiModels: fileURLToPath(new URL("./packages/ai/src/models.ts", import.meta.url)),
	aiOAuth: fileURLToPath(new URL("./packages/ai/src/oauth.ts", import.meta.url)),
	aiApi: fileURLToPath(new URL("./packages/ai/src/api", import.meta.url)),
	aiProviders: fileURLToPath(new URL("./packages/ai/src/providers", import.meta.url)),
	aiUtils: fileURLToPath(new URL("./packages/ai/src/utils", import.meta.url)),
	agentIndex: fileURLToPath(new URL("./packages/agent/src/index.ts", import.meta.url)),
	codemodeIndex: fileURLToPath(new URL("./packages/codemode/src/index.ts", import.meta.url)),
	codemodeDeclarations: fileURLToPath(new URL("./packages/codemode/src/declarations.ts", import.meta.url)),
	codemodeSource: fileURLToPath(new URL("./packages/codemode/src/source.ts", import.meta.url)),
	codingAgentIndex: fileURLToPath(new URL("./packages/coding-agent/src/index.ts", import.meta.url)),
	tuiIndex: fileURLToPath(new URL("./packages/tui/src/index.ts", import.meta.url)),
} as const;

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@evoharness\/chord$/, replacement: workspaceSourcePaths.chordIndex },
			{ find: /^@evoharness\/chord\/context$/, replacement: workspaceSourcePaths.chordContext },
			{ find: /^@evoharness\/chord\/delta$/, replacement: workspaceSourcePaths.chordDelta },
			{ find: /^@evoharness\/chord\/node$/, replacement: workspaceSourcePaths.chordNode },
			{ find: /^@evoharness\/telemetry$/, replacement: workspaceSourcePaths.telemetryIndex },
			{ find: /^@evoharness\/telemetry\/testing$/, replacement: workspaceSourcePaths.telemetryTesting },
			{ find: /^@evoharness\/mcp$/, replacement: workspaceSourcePaths.mcpIndex },
			{ find: /^@evoharness\/mcp\/oauth$/, replacement: workspaceSourcePaths.mcpOAuth },
			{ find: /^@evoharness\/mcp\/testing$/, replacement: workspaceSourcePaths.mcpTesting },
			{ find: /^@evoharness\/ai$/, replacement: workspaceSourcePaths.aiIndex },
			{ find: /^@evoharness\/ai\/compat$/, replacement: workspaceSourcePaths.aiCompat },
		{ find: /^@evoharness\/ai\/models$/, replacement: workspaceSourcePaths.aiModels },
			{ find: /^@evoharness\/ai\/oauth$/, replacement: workspaceSourcePaths.aiOAuth },
			{
				find: /^@evoharness\/ai\/utils\/(.+)$/,
				replacement: `${workspaceSourcePaths.aiUtils}/$1.ts`,
			},
			{
				find: /^@evoharness\/ai\/api\/(.+)$/,
				replacement: `${workspaceSourcePaths.aiApi}/$1.ts`,
			},
			{
				find: /^@evoharness\/ai\/providers\/(.+)$/,
				replacement: `${workspaceSourcePaths.aiProviders}/$1.ts`,
			},
			{ find: /^@evoharness\/agent-core$/, replacement: workspaceSourcePaths.agentIndex },
			{ find: /^@evoharness\/codemode$/, replacement: workspaceSourcePaths.codemodeIndex },
			{ find: /^@evoharness\/codemode\/declarations$/, replacement: workspaceSourcePaths.codemodeDeclarations },
			{ find: /^@evoharness\/codemode\/source$/, replacement: workspaceSourcePaths.codemodeSource },
			{ find: /^@evoharness\/tui$/, replacement: workspaceSourcePaths.tuiIndex },
		],
	},
});
