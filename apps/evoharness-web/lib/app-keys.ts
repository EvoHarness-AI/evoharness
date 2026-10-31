/**
 * The named single point for the app's localStorage key constants (spec
 * web-frontend-spec.md Annex E). `lib/app-prefs.ts` owns the map and the
 * storage helpers — this re-export exists so the rename rules, the guard and
 * future call sites have one importable name for the key family.
 *
 * Module-local keys (`evoharness-tool-preset`, `evoharness-thinking-expanded`,
 * `evoharness-web:terminal-tabs`, the `Symbol.for("evoharness-web:*")` names,
 * `globalThis.__evoharness*` caches and the `evoharness-web:*` session entry
 * types) stay inline in their owning modules on purpose: each has exactly one
 * consumer, and keeping them there avoids churning vendored call sites.
 * `scripts/check-web-names.mjs` guards the namespace as a whole.
 */

export { APP_PREF_KEYS } from "./app-prefs.ts";
