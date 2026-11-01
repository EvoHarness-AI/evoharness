import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerEnvConformance } from "@evoharness/durable/testing";
import { afterAll, describe, expect, it } from "vitest";
import { Connection } from "../src/connection.ts";
import { LocalExecutionEnv } from "../src/list-files.ts";
import { RemoteExecutionEnv } from "../src/remote-env.ts";
import { daemon } from "./daemon.ts";
import { posixShell, posixShellMissing } from "./posix-shell.ts";

const connection = new Connection({ command: [daemon] });
afterAll(() => connection.close());

const windows = process.platform === "win32";
// These suites assert POSIX semantics, so on Windows they need a Git Bash rather than the
// daemons' `sh` default. When none is reachable that is a missing toolchain, not a defect,
// so the suites skip instead of failing on a spawn error.
const scopedDescribe = describe.skipIf(posixShellMissing);
// symlinks: false because Git Bash's `ln -s` copies instead of linking unless native
// symlinks are enabled.
const options =
	windows && posixShell ? { shell: [posixShell, "-c"], symlinks: false, listFiles: true } : { listFiles: true };

registerEnvConformance(
	{ describe: scopedDescribe, expect, it },
	"RemoteExecutionEnv over a pipe",
	async (use) => {
		const cwd = mkdtempSync(join(tmpdir(), "evoharness-env-conformance-"));
		try {
			await use(
				new RemoteExecutionEnv({
					connection,
					id: "evoharness-env:test",
					cwd,
					shellPath: posixShell,
					watch: { pollIntervalMs: 100 },
				}),
			);
		} finally {
			// On Windows a killed command's processes can hold the directory for a moment.
			rmSync(cwd, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
		}
	},
	options,
);

registerEnvConformance(
	{ describe: scopedDescribe, expect, it },
	"LocalExecutionEnv",
	async (use) => {
		const cwd = mkdtempSync(join(tmpdir(), "evoharness-env-local-conformance-"));
		try {
			await use(new LocalExecutionEnv({ connection, cwd, watch: { pollIntervalMs: 100 } }));
		} finally {
			rmSync(cwd, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
		}
	},
	options,
);
