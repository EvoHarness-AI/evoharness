import type * as ChildProcess from "node:child_process";
import type * as Fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPowerShellConfig, getShellConfig } from "../src/utils/shell.ts";

const { accessSyncMock, spawnSyncMock } = vi.hoisted(() => ({
	accessSyncMock: vi.fn(),
	spawnSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof Fs>();
	return {
		...actual,
		accessSync: accessSyncMock,
	};
});

vi.mock("child_process", async (importOriginal) => ({
	...(await importOriginal<typeof ChildProcess>()),
	spawnSync: spawnSyncMock,
}));

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
const aliasesDir = "D:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps";

function stubPlatform(platform: string) {
	Object.defineProperty(process, "platform", { configurable: true, value: platform });
}

beforeEach(() => {
	vi.stubEnv("ProgramFiles", undefined);
	vi.stubEnv("ProgramFiles(x86)", undefined);
	accessSyncMock.mockReset();
	spawnSyncMock.mockReset();
});

afterEach(() => {
	Object.defineProperty(process, "platform", platformDescriptor);
	vi.unstubAllEnvs();
});

// nodejs/node#36790: runnable Store aliases pass access(F_OK) but fail the extra
// stat check existsSync performs on Windows only.
describe("Windows Store shell aliases", () => {
	beforeEach(() => {
		stubPlatform("win32");
	});

	it.each(["bash.exe", "pwsh.exe"])("accepts %s found on PATH", (executable) => {
		const alias = `${aliasesDir}\\${executable}`;
		// Argument-aware: resolving bash now probes for git.exe first, so a blanket
		// return would hand that probe the alias itself and derive a path from it.
		spawnSyncMock.mockImplementation((_command: string, args: string[]) =>
			args[0] === executable ? { status: 0, stdout: `${alias}\r\n` } : { status: 1, stdout: "" },
		);

		const config = executable === "pwsh.exe" ? getPowerShellConfig() : getShellConfig();

		expect(config.shell).toBe(alias);
	});

	it("accepts an explicitly configured shell alias", () => {
		const alias = `${aliasesDir}\\bash.exe`;

		expect(getShellConfig(alias).shell).toBe(alias);
	});

	it("still rejects PATH results that fail the existence check", () => {
		const windowsPowerShell = "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
		spawnSyncMock
			.mockReturnValueOnce({ status: 0, stdout: `${aliasesDir}\\pwsh.exe` })
			.mockReturnValueOnce({ status: 0, stdout: windowsPowerShell });
		accessSyncMock.mockImplementationOnce(() => {
			throw Object.assign(new Error("not found"), { code: "ENOENT" });
		});

		expect(getPowerShellConfig().shell).toBe(windowsPowerShell);
	});

	// Git for Windows keeps bash.exe under the install root, but PATH usually carries
	// only cmd\git.exe. A git installed off the default directory (portable, per-user,
	// another drive) therefore hid a Git Bash that was right there, and the only way
	// to use it was to set shellPath by hand.
	describe("Git Bash beside the git on PATH", () => {
		const gitOnPath = "D:\\DevelopTools\\Git\\Git\\cmd\\git.exe";
		const derivedBash = "D:\\DevelopTools\\Git\\Git\\bin\\bash.exe";

		function answerWhere(command: string): { status: number; stdout: string } {
			return command === "git.exe" ? { status: 0, stdout: `${gitOnPath}\r\n` } : { status: 1, stdout: "" };
		}

		function captureShellConfigError(): string {
			try {
				getShellConfig();
			} catch (error) {
				return String(error);
			}
			return "";
		}

		it("derives bash.exe from the git installation tree when Git is not in a known location", () => {
			spawnSyncMock.mockImplementation((_command: string, args: string[]) => answerWhere(args[0]));

			expect(getShellConfig().shell).toBe(derivedBash);
		});

		it("prefers the derived Git Bash over an unrelated bash on PATH", () => {
			spawnSyncMock.mockImplementation((_command: string, args: string[]) =>
				args[0] === "git.exe"
					? { status: 0, stdout: `${gitOnPath}\r\n` }
					: { status: 0, stdout: "C:\\cygwin64\\bin\\bash.exe\r\n" },
			);

			expect(getShellConfig().shell).toBe(derivedBash);
		});

		it("falls through to bash on PATH when git itself is not installed", () => {
			spawnSyncMock.mockImplementation((_command: string, args: string[]) =>
				args[0] === "bash.exe"
					? { status: 0, stdout: "C:\\msys64\\usr\\bin\\bash.exe\r\n" }
					: { status: 1, stdout: "" },
			);

			expect(getShellConfig().shell).toBe("C:\\msys64\\usr\\bin\\bash.exe");
		});

		it("names the derived candidates in the error so the search stays diagnosable", () => {
			spawnSyncMock.mockImplementation((_command: string, args: string[]) => answerWhere(args[0]));
			// git.exe is really there; no bash.exe is, anywhere.
			accessSyncMock.mockImplementation((path: string) => {
				if (String(path).endsWith("bash.exe")) {
					throw Object.assign(new Error("not found"), { code: "ENOENT" });
				}
			});

			const message = captureShellConfigError();

			expect(message).toContain("No bash shell found");
			expect(message).toContain(derivedBash);
		});
	});
});

// The access(F_OK) check is intentionally used on every platform, matching
// harness-v2 (packages/durable/src/env/node.ts pathExists). On Unix it is the
// same syscall existsSync already performs.
describe("Unix shell existence checks", () => {
	beforeEach(() => {
		stubPlatform("linux");
	});

	it("accepts /bin/bash when access(F_OK) succeeds", () => {
		expect(getShellConfig().shell).toBe("/bin/bash");
	});

	it("falls back to bash on PATH when /bin/bash fails access(F_OK)", () => {
		accessSyncMock.mockImplementationOnce(() => {
			throw Object.assign(new Error("not found"), { code: "ENOENT" });
		});
		spawnSyncMock.mockReturnValue({ status: 0, stdout: "/usr/local/bin/bash\n" });

		expect(getShellConfig().shell).toBe("/usr/local/bin/bash");
	});

	it("rejects an explicitly configured shell path that fails access(F_OK)", () => {
		accessSyncMock.mockImplementationOnce(() => {
			throw Object.assign(new Error("not found"), { code: "ENOENT" });
		});

		expect(() => getShellConfig("/missing/bash")).toThrow("Custom shell path not found: /missing/bash");
	});
});
