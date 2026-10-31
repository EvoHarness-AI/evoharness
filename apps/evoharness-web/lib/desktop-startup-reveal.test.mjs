import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

// The window is built hidden and shown when the first screen is ready. The
// shell side of this chain is the Electron main process (Phase 3, spec Annex
// G); the web-side links and fallbacks that keep it honest are pinned here.
test("the web app reports readiness through the host bridge", async () => {
  const native = await source("lib/desktop-native.ts");

  assert.match(native, /desktopReadyReported = true;/);
  assert.match(native, /await desktopHost\(\)\?\.appReady\(/);
  // One report per page load; the shell's own fallback covers the rest.
  assert.match(native, /if \(desktopReadyReported || !isDesktopHost\(\)\) return;/);
});

test("the first screen reports ready from the placeholder and from a loaded chat", async () => {
  const [appShell, chatWindow] = await Promise.all([
    source("components/AppShell.tsx"),
    source("components/ChatWindow.tsx"),
  ]);
  assert.match(appShell, /useReportDesktopReady\(showPlaceholder, "placeholder"\)/);
  assert.match(chatWindow, /useReportDesktopReady\(!loading, "chat"\)/);
});

test("the custom stylesheet does not block the first paint", async () => {
  const layout = await source("app/layout.tsx");
  assert.match(layout, /href="\/api\/custom-css" media="print"/);
  assert.match(layout, /CUSTOM_CSS_ACTIVATE_SCRIPT/);
});
