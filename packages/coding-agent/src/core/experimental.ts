export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.EVOHARNESS_EXPERIMENTAL === "1";
}
