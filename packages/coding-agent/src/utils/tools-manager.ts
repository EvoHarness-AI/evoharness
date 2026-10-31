import { type SpawnSyncReturns, spawnSync } from "child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { arch, homedir, platform } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { expandTildePath, getBinDir, VERSION } from "../config.ts";
import { getEvoharnessUserAgent } from "./evoharness-user-agent.ts";
import { fetchWithRetry } from "./management-http.ts";

const TOOLS_DIR = getBinDir();
const NETWORK_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
// grep and find call ensureTool on every invocation, so a failed download must not
// be retried per tool call: each attempt spends the whole network budget (version
// resolution plus download) while the tool stays unusable anyway.
const DOWNLOAD_FAILURE_COOLDOWN_MS = 5 * 60_000;
const DOWNLOAD_FAILURE_COOLDOWN_MINUTES = DOWNLOAD_FAILURE_COOLDOWN_MS / 60_000;

function isOfflineModeEnabled(): boolean {
	const value = process.env.EVOHARNESS_OFFLINE;
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

interface ToolConfig {
	name: string;
	repo: string; // GitHub repo (e.g., "sharkdp/fd")
	binaryName: string; // Name of the binary inside the archive
	systemBinaryNames?: string[]; // Alternative system command names to try before downloading
	tagPrefix: string; // Prefix for tags (e.g., "v" for v1.0.0, "" for 1.0.0)
	getAssetName: (version: string, target: string) => string;
}

// Map Node's platform/arch to the release target suffix shared by fd and ripgrep.
// Only x64 and arm64 are mapped. Other architectures (e.g. ARM32 `arm`, `ia32`)
// must not fall back to x86-64 binaries (#11209).
function getReleaseTarget(plat: string, architecture: string): string | undefined {
	const archStr = architecture === "arm64" ? "aarch64" : architecture === "x64" ? "x86_64" : undefined;
	if (!archStr) return undefined;
	if (plat === "darwin") return `${archStr}-apple-darwin.tar.gz`;
	if (plat === "linux") return `${archStr}-unknown-linux-musl.tar.gz`;
	if (plat === "win32") return `${archStr}-pc-windows-msvc.zip`;
	return undefined;
}

const TOOLS: Record<string, ToolConfig> = {
	fd: {
		name: "fd",
		repo: "sharkdp/fd",
		binaryName: "fd",
		systemBinaryNames: ["fd", "fdfind"],
		tagPrefix: "v",
		getAssetName: (version, target) => `fd-v${version}-${target}`,
	},
	rg: {
		name: "ripgrep",
		repo: "BurntSushi/ripgrep",
		binaryName: "rg",
		tagPrefix: "",
		getAssetName: (version, target) => `ripgrep-${version}-${target}`,
	},
};

const TOOL_PATH_ENV_VARS: Record<"fd" | "rg", string> = {
	fd: "EVOHARNESS_FD_PATH",
	rg: "EVOHARNESS_RG_PATH",
};

/** Tools whose download failed, mapped to the time after which a new attempt is allowed. */
const downloadFailures = new Map<"fd" | "rg", number>();

export function clearToolDownloadFailuresForTests(): void {
	downloadFailures.clear();
}

/** VS Code ships ripgrep, which is the same binary the grep tool needs. */
const VSCODE_RIPGREP_DIR = join("resources", "app", "node_modules.asar.unpacked", "@vscode", "ripgrep", "bin");

/**
 * Directories where package managers and bundled tools put binaries that are not
 * guaranteed to be on PATH: a shell started before the install, or a GUI launch
 * with a minimal PATH, both keep the binary invisible to `commandExists`.
 */
function getKnownInstallDirs(): string[] {
	const home = homedir();
	if (platform() === "win32") {
		const dirs: string[] = [];
		const localAppData = process.env.LOCALAPPDATA;
		const userProfile = process.env.USERPROFILE;
		const programData = process.env.ProgramData;
		const programFiles = process.env.ProgramFiles;
		if (localAppData) {
			dirs.push(join(localAppData, "Microsoft", "WinGet", "Links"));
			dirs.push(join(localAppData, "Programs", "Microsoft VS Code", VSCODE_RIPGREP_DIR));
		}
		if (programFiles) dirs.push(join(programFiles, "Microsoft VS Code", VSCODE_RIPGREP_DIR));
		if (userProfile) dirs.push(join(userProfile, "scoop", "shims"));
		if (programData) dirs.push(join(programData, "chocolatey", "bin"));
		return dirs;
	}
	if (platform() === "darwin") {
		return ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", join(home, ".local", "bin")];
	}
	return [join(home, ".local", "bin"), "/usr/local/bin", "/usr/bin", "/snap/bin", "/home/linuxbrew/.linuxbrew/bin"];
}

/** Actionable recovery text shown after a download fails. */
function getManualInstallHint(tool: "fd" | "rg"): string {
	const plat = platform();
	const name = TOOLS[tool].name;
	let command: string;
	if (plat === "win32") {
		command = tool === "fd" ? "winget install sharkdp.fd" : "winget install BurntSushi.ripgrep.MSVC";
	} else if (plat === "darwin") {
		command = tool === "fd" ? "brew install fd" : "brew install ripgrep";
	} else {
		command = tool === "fd" ? "apt install fd-find" : "apt install ripgrep";
	}
	const binary = TOOLS[tool].binaryName + (plat === "win32" ? ".exe" : "");
	return `Install ${name} manually: ${command}. Or put ${binary} in ${TOOLS_DIR}, or set ${TOOL_PATH_ENV_VARS[tool]} to an existing binary. The download is retried after ${DOWNLOAD_FAILURE_COOLDOWN_MINUTES} minutes, or immediately after a restart.`;
}

// Check if a command exists in PATH by trying to run it
function commandExists(cmd: string): boolean {
	try {
		const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
		// Check for ENOENT error (command not found)
		return result.error === undefined || result.error === null;
	} catch {
		return false;
	}
}

// Get the path to a tool (system-wide or in our tools dir)
export function getToolPath(tool: "fd" | "rg"): string | null {
	const config = TOOLS[tool];
	if (!config) return null;

	const binaryExt = platform() === "win32" ? ".exe" : "";

	// An explicit override wins: it is the only way to use a binary that sits
	// somewhere no scanner looks.
	const override = process.env[TOOL_PATH_ENV_VARS[tool]]?.trim();
	if (override) {
		const overridePath = expandTildePath(override);
		if (existsSync(overridePath)) {
			return overridePath;
		}
	}

	// Check our tools directory first
	const localPath = join(TOOLS_DIR, config.binaryName + binaryExt);
	if (existsSync(localPath)) {
		return localPath;
	}

	// Check system PATH - if found, just return the command name (it's in PATH)
	const systemBinaryNames = config.systemBinaryNames ?? [config.binaryName];
	for (const systemBinaryName of systemBinaryNames) {
		if (commandExists(systemBinaryName)) {
			return systemBinaryName;
		}
	}

	// Last resort before downloading: install locations that PATH can miss.
	for (const dir of getKnownInstallDirs()) {
		for (const systemBinaryName of systemBinaryNames) {
			const candidate = join(dir, systemBinaryName + binaryExt);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	return null;
}

// Resolve the latest release version from the release page redirect.
// The api.github.com releases endpoint counts against the anonymous API
// quota (60 requests/hour per IP), which is permanently exhausted behind
// shared egress IPs such as corporate proxies and CI runners. The web
// endpoint answers with a redirect to the tagged release at no quota cost
// and lives on the same origin as the binary download itself.
export async function getLatestVersion(repo: string): Promise<string> {
	const response = await fetchWithRetry(
		`https://github.com/${repo}/releases/latest`,
		{
			headers: { "User-Agent": getEvoharnessUserAgent(VERSION) },
			redirect: "manual",
		},
		{ timeoutMs: NETWORK_TIMEOUT_MS },
	);

	// Only the status and headers matter here. Discard the body so the
	// connection can be reused.
	try {
		await response.body?.cancel();
	} catch {
		// Discarding the body is best-effort.
	}

	const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
	if (!location) {
		throw new Error(`Failed to resolve latest ${repo} release: HTTP ${response.status} without redirect`);
	}

	const tag = new URL(location, "https://github.com").pathname.split("/").pop();
	if (!tag || !location.includes("/releases/tag/")) {
		throw new Error(`Failed to resolve latest ${repo} release: unexpected redirect to ${location}`);
	}
	return decodeURIComponent(tag).replace(/^v/, "");
}

// Download a file from URL
async function downloadFile(url: string, dest: string): Promise<void> {
	const response = await fetchWithRetry(url, undefined, { timeoutMs: DOWNLOAD_TIMEOUT_MS });

	if (!response.ok) {
		throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
	}

	if (!response.body) {
		throw new Error("No response body");
	}

	const fileStream = createWriteStream(dest);
	await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

function findBinaryRecursively(rootDir: string, binaryFileName: string): string | null {
	const stack: string[] = [rootDir];

	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) continue;

		const entries = readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isFile() && entry.name === binaryFileName) {
				return fullPath;
			}
			if (entry.isDirectory()) {
				stack.push(fullPath);
			}
		}
	}

	return null;
}

function formatSpawnFailure(result: SpawnSyncReturns<Buffer>): string {
	if (result.error?.message) {
		return result.error.message;
	}
	const stderr = result.stderr?.toString().trim();
	if (stderr) {
		return stderr;
	}
	const stdout = result.stdout?.toString().trim();
	if (stdout) {
		return stdout;
	}
	return `exit status ${result.status ?? "unknown"}`;
}

function runExtractionCommand(command: string, args: string[]): string | null {
	const result = spawnSync(command, args, { stdio: "pipe" });
	if (!result.error && result.status === 0) {
		return null;
	}
	return `${command}: ${formatSpawnFailure(result)}`;
}

function extractTarGzArchive(archivePath: string, extractDir: string, assetName: string): void {
	const failure = runExtractionCommand("tar", ["xzf", archivePath, "-C", extractDir]);
	if (failure) {
		throw new Error(`Failed to extract ${assetName}: ${failure}`);
	}
}

function getWindowsTarCommand(): string {
	const systemRoot = process.env.SystemRoot;
	if (systemRoot) {
		const systemTar = join(systemRoot, "System32", "tar.exe");
		if (existsSync(systemTar)) {
			return systemTar;
		}
	}
	return "tar.exe";
}

function extractZipArchive(archivePath: string, extractDir: string, assetName: string): void {
	const failures: string[] = [];

	if (platform() === "win32") {
		// Windows ships bsdtar as tar.exe, which supports zip files. Prefer the
		// System32 binary over Git Bash's GNU tar, which does not handle zip archives.
		const tarFailure = runExtractionCommand(getWindowsTarCommand(), ["xf", archivePath, "-C", extractDir]);
		if (!tarFailure) return;
		failures.push(tarFailure);

		const script =
			"& { param($archive, $destination) $ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
		const powershellFailure = runExtractionCommand("powershell.exe", [
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			script,
			archivePath,
			extractDir,
		]);
		if (!powershellFailure) return;
		failures.push(powershellFailure);
	} else {
		const unzipFailure = runExtractionCommand("unzip", ["-q", archivePath, "-d", extractDir]);
		if (!unzipFailure) return;
		failures.push(unzipFailure);

		const tarFailure = runExtractionCommand("tar", ["xf", archivePath, "-C", extractDir]);
		if (!tarFailure) return;
		failures.push(tarFailure);
	}

	throw new Error(`Failed to extract ${assetName}: ${failures.join("; ")}`);
}

// Download and install a tool
async function downloadTool(tool: "fd" | "rg"): Promise<string> {
	const config = TOOLS[tool];
	if (!config) throw new Error(`Unknown tool: ${tool}`);

	const plat = platform();
	const architecture = arch();
	const target = getReleaseTarget(plat, architecture);
	if (!target) {
		throw new Error(`Unsupported platform: ${plat}/${architecture}`);
	}

	// fd is pinned on darwin/x64, so skip the version lookup there.
	const version =
		tool === "fd" && plat === "darwin" && architecture === "x64" ? "10.3.0" : await getLatestVersion(config.repo);
	const assetName = config.getAssetName(version, target);

	// Create tools directory
	mkdirSync(TOOLS_DIR, { recursive: true });

	const downloadUrl = `https://github.com/${config.repo}/releases/download/${config.tagPrefix}${version}/${assetName}`;
	const archivePath = join(TOOLS_DIR, assetName);
	const binaryExt = plat === "win32" ? ".exe" : "";
	const binaryPath = join(TOOLS_DIR, config.binaryName + binaryExt);

	// Download
	await downloadFile(downloadUrl, archivePath);

	// Extract into a unique temp directory. fd and rg downloads can run concurrently
	// during startup, so sharing a fixed directory causes races.
	const extractDir = join(
		TOOLS_DIR,
		`extract_tmp_${config.binaryName}_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
	);
	mkdirSync(extractDir, { recursive: true });

	try {
		if (assetName.endsWith(".tar.gz")) {
			extractTarGzArchive(archivePath, extractDir, assetName);
		} else if (assetName.endsWith(".zip")) {
			extractZipArchive(archivePath, extractDir, assetName);
		} else {
			throw new Error(`Unsupported archive format: ${assetName}`);
		}

		// Find the binary in extracted files. Some archives contain files directly
		// at root, others nest under a versioned subdirectory.
		const binaryFileName = config.binaryName + binaryExt;
		const extractedDir = join(extractDir, assetName.replace(/\.(tar\.gz|zip)$/, ""));
		const extractedBinaryCandidates = [join(extractedDir, binaryFileName), join(extractDir, binaryFileName)];
		let extractedBinary = extractedBinaryCandidates.find((candidate) => existsSync(candidate));

		if (!extractedBinary) {
			extractedBinary = findBinaryRecursively(extractDir, binaryFileName) ?? undefined;
		}

		if (extractedBinary) {
			renameSync(extractedBinary, binaryPath);
		} else {
			throw new Error(`Binary not found in archive: expected ${binaryFileName} under ${extractDir}`);
		}

		// Make executable (Unix only)
		if (plat !== "win32") {
			chmodSync(binaryPath, 0o755);
		}
	} finally {
		// Cleanup
		rmSync(archivePath, { force: true });
		rmSync(extractDir, { recursive: true, force: true });
	}

	return binaryPath;
}

// Termux package names for tools
const TERMUX_PACKAGES: Record<string, string> = {
	fd: "fd",
	rg: "ripgrep",
};

export interface ToolStatus {
	type: "info" | "warning";
	message: string;
}

/**
 * Ensure a tool is available, downloading if necessary.
 * Reports progress through `onStatus`; status messages are otherwise silent.
 * Returns the tool path, or undefined if unavailable.
 */
export async function ensureTool(
	tool: "fd" | "rg",
	onStatus?: (status: ToolStatus) => void,
): Promise<string | undefined> {
	const existingPath = getToolPath(tool);
	if (existingPath) {
		return existingPath;
	}

	const config = TOOLS[tool];
	if (!config) return undefined;

	if (isOfflineModeEnabled()) {
		onStatus?.({ type: "warning", message: `${config.name} not found. Offline mode enabled, skipping download.` });
		return undefined;
	}

	// On Android/Termux, Linux binaries don't work due to Bionic libc incompatibility.
	// Users must install via pkg.
	if (platform() === "android") {
		const pkgName = TERMUX_PACKAGES[tool] ?? tool;
		onStatus?.({ type: "warning", message: `${config.name} not found. Install with: pkg install ${pkgName}` });
		return undefined;
	}

	// Prebuilt downloads only exist for the targets mapped in getReleaseTarget.
	if (!getReleaseTarget(platform(), arch())) {
		onStatus?.({
			type: "warning",
			message: `${config.name} not found. Automatic download is not supported on ${platform()}/${arch()}. Install ${config.name} with your system package manager.`,
		});
		return undefined;
	}

	const failedAt = downloadFailures.get(tool);
	if (failedAt !== undefined && Date.now() - failedAt < DOWNLOAD_FAILURE_COOLDOWN_MS) {
		onStatus?.({
			type: "warning",
			message: `${config.name} not found. Skipping the download: the previous attempt failed less than ${DOWNLOAD_FAILURE_COOLDOWN_MINUTES} minutes ago. Restart EvoHarness to retry now.`,
		});
		return undefined;
	}

	// Tool not found - download it
	onStatus?.({ type: "info", message: `${config.name} not found. Downloading...` });

	try {
		const path = await downloadTool(tool);
		downloadFailures.delete(tool);
		onStatus?.({ type: "info", message: `${config.name} installed to ${path}` });
		return path;
	} catch (e) {
		// Include the error cause chain: fetch failures surface as a bare
		// "fetch failed" TypeError with the actionable detail (DNS, TLS,
		// timeout) hidden in the cause. Depth-capped to guard against
		// circular cause chains.
		const messages: string[] = [];
		for (
			let current: unknown = e, depth = 0;
			current instanceof Error && depth < 5;
			current = current.cause, depth++
		) {
			if (!messages.includes(current.message)) messages.push(current.message);
		}
		downloadFailures.set(tool, Date.now());
		onStatus?.({
			type: "warning",
			message: `Failed to download ${config.name}: ${messages.length > 0 ? messages.join(": ") : String(e)}`,
		});
		onStatus?.({ type: "info", message: getManualInstallHint(tool) });
		return undefined;
	}
}
