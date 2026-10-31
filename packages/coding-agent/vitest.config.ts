import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { workspaceSourcePaths } from "../../vitest.base.ts";

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			globals: true,
			environment: "node",
			testTimeout: 30000,
			// Tests run offline by default; opt in with allowNetwork() from test/test-network-env.ts.
			env: { EVOHARNESS_OFFLINE: "1" },
			unstubEnvs: true,
			reporters: process.env.GITHUB_ACTIONS ? ["dot", "github-actions"] : ["dot"],
			silent: "passed-only",
			server: {
				deps: {
					external: [/@silvia-odwyer\/photon-node/],
				},
			},
		},
		resolve: {
			alias: [
				{ find: /^@evoharness\/ai$/, replacement: workspaceSourcePaths.aiIndex },
				{ find: /^@evoharness\/agent-core$/, replacement: workspaceSourcePaths.agentIndex },
				{ find: /^@evoharness\/evoharness-ai$/, replacement: workspaceSourcePaths.aiIndex },
				{ find: /^@evoharness\/evoharness-ai\/oauth$/, replacement: workspaceSourcePaths.aiOAuth },
				{ find: /^@evoharness\/evoharness-agent-core$/, replacement: workspaceSourcePaths.agentIndex },
				{ find: /^@evoharness\/evoharness-tui$/, replacement: workspaceSourcePaths.tuiIndex },
			],
		},
	}),
);
