/**
 * Titlebar Spinner Extension
 *
 * Shows a braille spinner animation in the terminal title while the agent is working.
 * Uses `ctx.ui.setTitle()` to update the terminal title via the extension API.
 *
 * Usage:
 *   evoharness --extension examples/extensions/titlebar-spinner.ts
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@evoharness/coding-agent";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function getBaseTitle(evoharness: ExtensionAPI): string {
	const cwd = path.basename(process.cwd());
	const session = evoharness.getSessionName();
	return session ? `EvoHarness - ${session} - ${cwd}` : `EvoHarness - ${cwd}`;
}

export default function (evoharness: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | null = null;
	let frameIndex = 0;

	function stopAnimation(ctx: ExtensionContext) {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		frameIndex = 0;
		ctx.ui.setTitle(getBaseTitle(evoharness));
	}

	function startAnimation(ctx: ExtensionContext) {
		stopAnimation(ctx);
		timer = setInterval(() => {
			const frame = BRAILLE_FRAMES[frameIndex % BRAILLE_FRAMES.length];
			const cwd = path.basename(process.cwd());
			const session = evoharness.getSessionName();
			const title = session ? `${frame} EvoHarness - ${session} - ${cwd}` : `${frame} EvoHarness - ${cwd}`;
			ctx.ui.setTitle(title);
			frameIndex++;
		}, 80);
	}

	evoharness.on("agent_start", async (_event, ctx) => {
		startAnimation(ctx);
	});

	evoharness.on("agent_settled", async (_event, ctx) => {
		stopAnimation(ctx);
	});

	evoharness.on("session_shutdown", async (_event, ctx) => {
		stopAnimation(ctx);
	});
}
