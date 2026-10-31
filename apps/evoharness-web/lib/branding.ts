/**
 * Local product branding.
 *
 * Keep this separate from the upstream package/repository names so syncing a
 * newer upstream release cannot silently change the user-facing brand.
 */
export const PRODUCT_NAME = "EvoHarness" as const;

/** Name of this packaged desktop distribution (the Electron shell is a later phase). */
export const APP_DISTRIBUTION_NAME = "evoharness-desktop" as const;

/**
 * App version, bumped alongside the root release; `check:web` asserts it stays
 * equal to the root package.json version.
 */
export const APP_VERSION = "0.0.2" as const;

export const APP_VERSION_DISPLAY = APP_VERSION.endsWith(".0")
  ? APP_VERSION.slice(0, -2)
  : APP_VERSION;
