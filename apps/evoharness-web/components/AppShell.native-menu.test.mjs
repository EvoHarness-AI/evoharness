import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useNativeAppMenu.ts", import.meta.url), "utf8");

test("routes native macOS menu actions into app state", () => {
  assert.match(appShellSource, /useNativeAppMenu\(handleNativeMenuAction\)/);
  assert.match(appShellSource, /payload === "new-session"/);
  assert.match(appShellSource, /payload === "settings-general" \|\| payload === "settings-models"/);
  assert.match(appShellSource, /setSettingsSection\(payload === "settings-general" \? "general" : "models"\)/);
  // The hook subscribes through the host bridge; the shell-side menu that emits
  // the actions is the Electron main process (Phase 3, spec Annex G).
  assert.match(hookSource, /host\.onMenuAction\(onAction\)/);
  assert.doesNotMatch(hookSource, /@tauri-apps/);
});
