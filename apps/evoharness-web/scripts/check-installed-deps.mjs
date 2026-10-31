/**
 * Check that node_modules matches package-lock.json for every direct
 * dependency. A stale install (a worktree created before an SDK bump, a branch
 * switch without `npm ci`) makes the suite fail for reasons that are not in the
 * code: after the pi SDK 1.3.0 bump, a node_modules still on 1.1.0 failed the
 * `enabled-models-runtime` tests, which pin 1.3 behaviour.
 *
 *   node scripts/check-installed-deps.mjs
 *
 * Runs before `npm test` (the `pretest` script). Exits 1 with the mismatches.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * @param {{ pkg: object, lock: object, readInstalledVersion: (name: string) => string | null }} input
 * @returns {{ name: string, expected: string, installed: string | null }[]}
 */
export function findInstallMismatches({ pkg, lock, readInstalledVersion }) {
  const names = new Set(DEPENDENCY_FIELDS.flatMap((field) => Object.keys(pkg[field] ?? {})));
  const mismatches = [];
  for (const name of [...names].sort()) {
    const entry = lock.packages?.[`node_modules/${name}`];
    // Not in the lock (e.g. an optional dependency for another platform).
    if (!entry?.version) continue;
    const installed = readInstalledVersion(name);
    if (installed === entry.version) continue;
    if (installed === null && entry.optional) continue;
    mismatches.push({ name, expected: entry.version, installed });
  }
  return mismatches;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
  // Workspace layout: the lockfile and the hoisted node_modules live at the
  // repository root; a version conflict with another workspace lands the app's
  // copy in its own node_modules. Normalize both lockfile shapes so the shared
  // mismatch logic below sees plain `node_modules/<name>` entries.
  const repoRoot = join(appDir, "..", "..");
  const realLock = readJson(join(repoRoot, "package-lock.json"));
  const appPrefix = "apps/evoharness-web/node_modules/";
  const packages = {};
  for (const [key, value] of Object.entries(realLock.packages ?? {})) {
    if (key.startsWith(appPrefix)) {
      packages[`node_modules/${key.slice(appPrefix.length)}`] = value;
    } else if (!packages[key]) {
      packages[key] = value;
    }
  }
  const mismatches = findInstallMismatches({
    pkg: readJson(join(appDir, "package.json")),
    lock: { packages },
    readInstalledVersion: (name) => {
      for (const base of [join(appDir, "node_modules"), join(repoRoot, "node_modules")]) {
        try {
          return readJson(join(base, name, "package.json")).version ?? null;
        } catch {
          // Try the next resolution root.
        }
      }
      return null;
    },
  });
  if (mismatches.length === 0) return;
  console.error("node_modules does not match package-lock.json:");
  for (const { name, expected, installed } of mismatches) {
    console.error(`  ${name}: lock ${expected}, installed ${installed ?? "(missing)"}`);
  }
  console.error("Run `npm install --ignore-scripts` at the repository root to reinstall.");
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
