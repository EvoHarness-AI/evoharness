import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// app-prefs.ts stays self-contained (upstream shape); this module is the named
// single point the spec's rename rules refer to, re-exporting its key map.
const jiti = createJiti(import.meta.url);
const { APP_PREF_KEYS } = await jiti.import("./app-keys.ts");

test("every preference key stays in the evoharness namespace", () => {
  for (const [name, key] of Object.entries(APP_PREF_KEYS)) {
    assert.match(
      key,
      /^evoharness-(?:web:[a-z0-9-]+|[a-z0-9-]+)$/,
      `${name} must stay namespaced under evoharness-`,
    );
  }
});

test("removed feature keys do not come back", () => {
  // The upstream update-check feature was cut in the port (spec B.2); its
  // preference key must not return without the feature.
  assert.ok(!("updateSnooze" in APP_PREF_KEYS));
});
