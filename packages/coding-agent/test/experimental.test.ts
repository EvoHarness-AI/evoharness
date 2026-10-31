import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalEvoharnessExperimental = process.env.EVOHARNESS_EXPERIMENTAL;

	afterEach(() => {
		if (originalEvoharnessExperimental === undefined) {
			delete process.env.EVOHARNESS_EXPERIMENTAL;
		} else {
			process.env.EVOHARNESS_EXPERIMENTAL = originalEvoharnessExperimental;
		}
	});

	it("returns false when EVOHARNESS_EXPERIMENTAL is unset", () => {
		delete process.env.EVOHARNESS_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when EVOHARNESS_EXPERIMENTAL is empty", () => {
		process.env.EVOHARNESS_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when EVOHARNESS_EXPERIMENTAL is set to 1", () => {
		process.env.EVOHARNESS_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when EVOHARNESS_EXPERIMENTAL is set to 0", () => {
		process.env.EVOHARNESS_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when EVOHARNESS_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.EVOHARNESS_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});
