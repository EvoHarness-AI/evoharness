import type * as ChildProcess from "node:child_process";
import type * as Fs from "node:fs";
import { existsSync } from "node:fs";
import type * as Os from "node:os";
import { join } from "node:path";
import { arch, platform } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearToolDownloadFailuresForTests,
	ensureTool,
	getLatestVersion,
	getToolPath,
	type ToolStatus,
} from "../src/utils/tools-manager.ts";

const originalOffline = process.env.EVOHARNESS_OFFLINE;
const originalFdPath = process.env.EVOHARNESS_FD_PATH;
const originalLocalAppData = process.env.LOCALAPPDATA;

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal<typeof Fs>();
	return {
		...actual,
		existsSync: vi.fn(() => false),
	};
});

vi.mock("os", async (importOriginal) => {
	const actual = await importOriginal<typeof Os>();
	return {
		...actual,
		arch: vi.fn(() => "x64"),
		platform: vi.fn(() => "linux"),
	};
});

vi.mock("child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof ChildProcess>();
	return {
		...actual,
		spawnSync: vi.fn(() => ({ error: new Error("not found") })),
	};
});

afterEach(() => {
	if (originalOffline === undefined) delete process.env.EVOHARNESS_OFFLINE;
	else process.env.EVOHARNESS_OFFLINE = originalOffline;
	if (originalFdPath === undefined) delete process.env.EVOHARNESS_FD_PATH;
	else process.env.EVOHARNESS_FD_PATH = originalFdPath;
	if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
	else process.env.LOCALAPPDATA = originalLocalAppData;
	vi.unstubAllGlobals();
	vi.mocked(arch).mockReturnValue("x64");
	vi.mocked(platform).mockReturnValue("linux");
	vi.mocked(existsSync).mockReturnValue(false);
	clearToolDownloadFailuresForTests();
});

function redirectResponse(location: string): Response {
	return new Response(null, { status: 302, headers: { location } });
}

describe("getLatestVersion", () => {
	it("resolves the version from the release page redirect", async () => {
		const fetchMock = vi.fn(async () => redirectResponse("https://github.com/sharkdp/fd/releases/tag/v10.4.2"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestVersion("sharkdp/fd")).resolves.toBe("10.4.2");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://github.com/sharkdp/fd/releases/latest",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("keeps tags without a v prefix intact", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => redirectResponse("https://github.com/BurntSushi/ripgrep/releases/tag/15.2.0")),
		);

		await expect(getLatestVersion("BurntSushi/ripgrep")).resolves.toBe("15.2.0");
	});

	it("resolves relative redirect targets", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => redirectResponse("/sharkdp/fd/releases/tag/v10.4.2")),
		);

		await expect(getLatestVersion("sharkdp/fd")).resolves.toBe("10.4.2");
	});

	it("discards the redirect response body", async () => {
		const response = new Response("<html></html>", {
			status: 302,
			headers: { location: "https://github.com/sharkdp/fd/releases/tag/v10.4.2" },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response),
		);

		await expect(getLatestVersion("sharkdp/fd")).resolves.toBe("10.4.2");
		expect(response.bodyUsed).toBe(true);
	});

	it("fails clearly when the endpoint does not redirect", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("not found", { status: 404 })),
		);

		await expect(getLatestVersion("sharkdp/fd")).rejects.toThrow(
			"Failed to resolve latest sharkdp/fd release: HTTP 404 without redirect",
		);
	});

	it("fails clearly when the redirect does not point at a release tag", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => redirectResponse("https://github.com/login")),
		);

		await expect(getLatestVersion("sharkdp/fd")).rejects.toThrow(
			"Failed to resolve latest sharkdp/fd release: unexpected redirect to https://github.com/login",
		);
	});
});

describe("getToolPath", () => {
	it("prefers an explicit binary path from the environment", () => {
		process.env.EVOHARNESS_FD_PATH = "/opt/tools/fd";
		vi.mocked(existsSync).mockImplementation((candidate) => candidate === "/opt/tools/fd");

		expect(getToolPath("fd")).toBe("/opt/tools/fd");
	});

	// A winget/scoop install lands next to PATH: a shell started before the install
	// cannot see it, so the download would run again on top of an existing binary.
	it("finds a Windows install that is not on PATH", () => {
		vi.mocked(platform).mockReturnValue("win32");
		process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";
		const installed = join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "rg.exe");
		vi.mocked(existsSync).mockImplementation((candidate) => candidate === installed);

		expect(getToolPath("rg")).toBe(installed);
	});
});

describe("ensureTool", () => {
	it("reports status through a callback without writing to the console", async () => {
		process.env.EVOHARNESS_OFFLINE = "1";
		const statuses: ToolStatus[] = [];
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await ensureTool("fd", (status) => statuses.push(status));

		expect(result).toBeUndefined();
		expect(statuses).toEqual([
			{
				type: "warning",
				message: "fd not found. Offline mode enabled, skipping download.",
			},
		]);
		expect(consoleLog).not.toHaveBeenCalled();
		consoleLog.mockRestore();
	});

	it("surfaces the error cause chain when a download fails", async () => {
		delete process.env.EVOHARNESS_OFFLINE;
		const cause = new Error("connect ETIMEDOUT 140.82.113.3:443");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed", { cause });
			}),
		);
		const statuses: ToolStatus[] = [];

		const result = await ensureTool("fd", (status) => statuses.push(status));

		expect(result).toBeUndefined();
		expect(statuses.slice(0, 2)).toEqual([
			{ type: "info", message: "fd not found. Downloading..." },
			{
				type: "warning",
				message: "Failed to download fd: fetch failed: connect ETIMEDOUT 140.82.113.3:443",
			},
		]);
		// The failure is actionable: how to install it without the network.
		expect(statuses[2]).toEqual({ type: "info", message: expect.stringContaining("EVOHARNESS_FD_PATH") });
	});

	it("does not retry the download on every tool call after a failure", async () => {
		delete process.env.EVOHARNESS_OFFLINE;
		const fetchMock = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		vi.stubGlobal("fetch", fetchMock);
		await ensureTool("fd", () => {});
		const attemptsAfterFailure = fetchMock.mock.calls.length;

		const statuses: ToolStatus[] = [];
		const second = await ensureTool("fd", (status) => statuses.push(status));

		expect(second).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(attemptsAfterFailure);
		expect(statuses).toEqual([
			{
				type: "warning",
				message:
					"fd not found. Skipping the download: the previous attempt failed less than 5 minutes ago. Restart EvoHarness to retry now.",
			},
		]);
	});

	// #11209: ARM32 previously fell back to x86-64 release archives.
	it.each(["arm", "ia32"])("does not download x86-64 binaries on %s", async (architecture) => {
		delete process.env.EVOHARNESS_OFFLINE;
		vi.mocked(arch).mockReturnValue(architecture as NodeJS.Architecture);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const statuses: ToolStatus[] = [];

		const result = await ensureTool("rg", (status) => statuses.push(status));

		expect(result).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(statuses).toEqual([
			{
				type: "warning",
				message: `ripgrep not found. Automatic download is not supported on linux/${architecture}. Install ripgrep with your system package manager.`,
			},
		]);
	});
});
