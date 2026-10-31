import { foregroundAnsi, isAppleTerminalSession, rgbColor } from "@evoharness/tui";
import { theme } from "../theme/theme.ts";

const CORAL = rgbColor(228, 138, 122);
const BLUE = rgbColor(79, 142, 179);
const YELLOW = rgbColor(234, 182, 93);
const RESET = "\x1b[0m";

/**
 * The evoharness logo: 4 cells wide and 2 lines tall. Each cell shows two square pixels with half blocks:
 *
 *   coral coral coral coral
 *   coral .     .     .
 *   blue  blue  blue  .
 *   blue  blue  blue  yellow
 *
 * The brand colors stay fixed across themes; they follow the terminal's color mode.
 */
export function evoharnessLogoLines(): [string, string] {
	const mode = theme.getColorMode();
	const fg = (color: typeof CORAL) => foregroundAnsi(color, mode);
	const top = `${fg(CORAL)}█▀▀▀${RESET}`;
	const bottom = `${fg(BLUE)}███${RESET}${fg(YELLOW)}▄${RESET}`;
	return [top, bottom];
}

/**
 * Whether the terminal renders the half-block logo correctly. Apple Terminal draws gaps between rows and
 * misaligns the half blocks, so it gets the text wordmark instead.
 */
export function supportsEvoharnessLogo(): boolean {
	return !isAppleTerminalSession();
}

/** Text fallback for the logo: "EvoHarness" with the logo's coral and yellow. */
export function evoharnessWordmark(): string {
	const mode = theme.getColorMode();
	return `${foregroundAnsi(CORAL, mode)}E${RESET}${foregroundAnsi(YELLOW, mode)}voHarness${RESET}`;
}
