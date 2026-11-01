import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageDirectory, "src");
const IMPORT_SPECIFIER = /(?:import|export)\s+(?:type\s+)?(?:[^;]*?\sfrom\s*)?["']([^"']+)["']/gu;

describe("package boundary", () => {
	// evoharness-telemetry is the one allowed EvoHarness package: a leaf without dependencies, needed for Context.telemetry.
	const ALLOWED = new Set(["@evoharness/telemetry"]);

	test("does not depend on EvoHarness packages other than evoharness-telemetry, or on files outside Chord", async () => {
		const manifest = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
		};
		expect(
			Object.keys(manifest.dependencies ?? {}).filter(
				(name) => name.startsWith("@evoharness/") && !ALLOWED.has(name),
			),
		).toEqual([]);

		const paths = (await readdir(sourceDirectory, { recursive: true })).filter((path) => path.endsWith(".ts")).sort();
		const violations: string[] = [];
		for (const path of paths) {
			const file = resolve(sourceDirectory, path);
			const source = await readFile(file, "utf8");
			for (const match of source.matchAll(IMPORT_SPECIFIER)) {
				const specifier = match[1]!;
				const pkg = specifier.split("/").slice(0, 2).join("/");
				if (specifier.startsWith("@evoharness/") && !ALLOWED.has(pkg)) violations.push(`${path}: ${specifier}`);
				// Compare with relative(), not a string prefix: resolve() yields native separators, so
				// `${sourceDirectory}/` never matched on Windows and flagged every internal import.
				// An escape reads as "..\...", and a sibling like src-evil/ no longer slips past a `/` suffix.
				if (specifier.startsWith(".")) {
					const inside = relative(sourceDirectory, resolve(dirname(file), specifier));
					if (inside.startsWith("..") || isAbsolute(inside)) violations.push(`${path}: ${specifier}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});
});
