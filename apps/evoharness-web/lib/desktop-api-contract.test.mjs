import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("every native-dialog filesystem route requires desktop authorization", async () => {
  const routes = await Promise.all([
    source("app/api/desktop/read-images/route.ts"),
    source("app/api/desktop/save/route.ts"),
    source("app/api/files/[...path]/route.ts"),
  ]);
  for (const route of routes) {
    assert.match(route, /isDesktopApiRequestAllowed\(request\)/);
  }
});

test("desktop token crosses only the host-bridge and process environment contract", async () => {
  // The shell side of this contract (the Electron main process in Phase 3,
  // spec Annex G) receives the token at spawn time and hands it to the bridge;
  // the web app must only ever send it as a header on privileged routes.
  const [native, identityRoute] = await Promise.all([
    source("lib/desktop-native.ts"),
    source("app/api/desktop/identity/route.ts"),
  ]);

  assert.match(native, /\.getDesktopApiToken\(\)/);
  assert.match(native, /headers\.set\(DESKTOP_API_TOKEN_HEADER/);
  assert.match(identityRoute, /DESKTOP_INSTANCE_ID_HEADER/);
  assert.match(identityRoute, /status: 204/);
});
