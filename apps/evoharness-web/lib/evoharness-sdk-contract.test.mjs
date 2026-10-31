import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// The MCP chain loads six SDK-internal dist files plus the @evoharness/mcp
// package root by file path (lib/evoharness-sdk-internals.ts). A missing file
// or a renamed export would surface only as a silent `ok: false` at runtime —
// this test loads the real installed SDK and pins the whole contract, so a
// core refactor that breaks it turns red here instead of in production.
const jiti = createJiti(import.meta.url);
const { loadPiSdkInternals } = await jiti.import("./evoharness-sdk-internals.ts");

const result = await loadPiSdkInternals();
const reason = result.ok ? "" : result.reason;

test("the six SDK-internal dist modules exist in the installed coding-agent", () => {
  assert.equal(result.ok, true, `MCP internals failed to load: ${reason}`);
  const modules = {
    mcpExtension: "dist/extensions/mcp/index.js",
    mcpRuntime: "dist/extensions/mcp/runtime.js",
    mcpConfig: "dist/extensions/mcp/config.js",
    mcpOAuth: "dist/extensions/mcp/oauth.js",
    mcpServers: "dist/core/mcp-servers.js",
    mcpConfigValues: "dist/core/resolve-config-value.js",
  };
  for (const [name, relativePath] of Object.entries(modules)) {
    assert.equal(
      existsSync(join(result.packageDir, relativePath)),
      true,
      `${name}: ${relativePath} is missing from the installed @evoharness/coding-agent`,
    );
  }
});

test("all sixteen private symbols resolve to live values", () => {
  assert.equal(result.ok, true, `MCP internals failed to load: ${reason}`);
  const required = [
    "McpServerConnection", "createDefaultTransport", "StdioTransport",
    "loadMcpConfig", "addMcpServerConfig", "updateMcpServerConfig",
    "removeMcpServerConfig", "validateMcpServerConfig", "getMcpToolExposure",
    "signInMcpServer", "McpOAuthCredentialStore", "McpSignInCancelledError",
    "resolveConfigValueOrThrow", "resolveHeadersOrThrow",
    "getConfigValueEnvVarNames", "isCommandConfigValue",
  ];
  for (const name of required) {
    assert.notEqual(result[name], undefined, `${name} is missing from the loaded SDK internals`);
  }
  for (const className of ["McpServerConnection", "StdioTransport", "McpOAuthCredentialStore"]) {
    assert.equal(typeof result[className], "function", `${className} must be a constructor`);
  }
});

test("the codemode dist files the settings self-test imports exist", () => {
  assert.equal(result.ok, true, `MCP internals failed to load: ${reason}`);
  for (const relativePath of ["dist/extensions/codemode/index.js", "dist/extensions/codemode/tool.js"]) {
    assert.equal(
      existsSync(join(result.packageDir, relativePath)),
      true,
      `${relativePath} is missing from the installed @evoharness/coding-agent`,
    );
  }
});
