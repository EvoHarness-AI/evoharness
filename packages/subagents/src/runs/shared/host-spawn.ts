import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CODING_AGENT_PACKAGE_ROOT_ENV } from "../../shared/utils.ts";

export const CODING_AGENT_PACKAGE = "@evoharness/coding-agent";
export const EVOHARNESS_SUBAGENT_HOST_BINARY_ENV = "EVOHARNESS_SUBAGENT_HOST_BINARY";

export function findPiPackageRootFromEntry(entryPoint: string): string | undefined {
	let dir = path.dirname(entryPoint);
	while (dir !== path.dirname(dir)) {
		const packageJsonPath = path.join(dir, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
				name?: unknown;
			};
			if (pkg.name === CODING_AGENT_PACKAGE) return dir;
		}
		dir = path.dirname(dir);
	}
	return undefined;
}

export function resolveInstalledHostPackageRoot(): string | undefined {
	try {
		return findPiPackageRootFromEntry(fileURLToPath(import.meta.resolve(CODING_AGENT_PACKAGE)));
	} catch {
		return undefined;
	}
}

export function resolvePiPackageRoot(entry = process.argv[1]): string | undefined {
	try {
		return entry ? findPiPackageRootFromEntry(fs.realpathSync(entry)) : undefined;
	} catch {
		// process.argv[1] probing is best-effort; callers can fall back to PATH/package resolution.
		return undefined;
	}
}

/** Resolve only the canonical host entry's local dependency graph, not NODE_PATH/global stores. */
export function resolveHostDependencyPiPackageRoot(entry = process.argv[1]): string | undefined {
	let canonicalEntry: string;
	try {
		if (!entry) return undefined;
		canonicalEntry = fs.realpathSync(entry);
	} catch {
		return undefined;
	}
	let dir = path.dirname(canonicalEntry);
	for (;;) {
		const root = path.join(dir, "node_modules", CODING_AGENT_PACKAGE);
		try {
			fs.lstatSync(root);
		} catch (error) {
			// ENOTDIR: a file named node_modules is not a candidate, so keep walking like Node's resolver.
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			const parent = path.dirname(dir);
			if (parent === dir) return undefined;
			dir = parent;
			continue;
		}
		// The nearest candidate is authoritative, even with a broken link or manifest.
		const canonicalRoot = fs.realpathSync(root);
		readHostPackageJson(path.join(canonicalRoot, "package.json"));
		return canonicalRoot;
	}
}

/** One SDK root for foreground imports and detached peer aliases; never retry a selected root. */
export function resolveHostPackageRoot(deps: HostSpawnDeps = {}): string | undefined {
	return selectPiPackage(deps)?.root;
}

export interface HostSpawnDeps {
	platform?: NodeJS.Platform;
	execPath?: string;
	argv1?: string;
	bunVersion?: string;
	existsSync?: (filePath: string) => boolean;
	realpathSync?: (filePath: string) => string;
	readFileSync?: (filePath: string, encoding: "utf-8") => string;
	resolvePackageJson?: () => string;
	resolvePackageEntry?: () => string;
	hostPackageRoot?: string;
	env?: NodeJS.ProcessEnv;
}

/** Compiled evoharness's entrypoint is virtual; execPath is the real (possibly renamed) image. */
export function resolveBunHostExecutable(deps: HostSpawnDeps = {}): string | undefined {
	const bunVersion = deps.bunVersion ?? process.versions.bun;
	const entry = deps.argv1 ?? process.argv[1];
	if (!bunVersion || !entry || !/^(?:\/\$bunfs\/|B:[\\/]~BUN[\\/])/.test(entry)) return undefined;
	const env = deps.env ?? process.env;
	return env[EVOHARNESS_SUBAGENT_HOST_BINARY_ENV]?.trim() || (deps.execPath ?? process.execPath);
}

interface HostSpawnCommand {
	command: string;
	args: string[];
}

interface HostPackageJson {
	name?: unknown;
	bin?: string | Record<string, string>;
}

function isNodeScriptPath(filePath: string): boolean {
	return /\.(?:mjs|cjs|js)$/i.test(filePath);
}

function isRunnableNodeScript(filePath: string, existsSync: (filePath: string) => boolean): boolean {
	if (!existsSync(filePath)) return false;
	return isNodeScriptPath(filePath);
}

function normalizePath(filePath: string): string {
	return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function isStandalonePiExecutable(execPath: string): boolean {
	const executableName = execPath.split(/[\\/]/).pop();
	return /^evoharness(?:\.exe)?$/i.test(executableName ?? "");
}

function readHostPackageJson(
	packageJsonPath: string,
	readFileSync: (filePath: string, encoding: "utf-8") => string = (filePath, encoding) =>
		fs.readFileSync(filePath, encoding),
): HostPackageJson {
	const source = readFileSync(packageJsonPath, "utf-8");
	let pkg: unknown;
	try {
		pkg = JSON.parse(source);
	} catch (error) {
		throw new Error(`invalid host SDK manifest at ${packageJsonPath}: malformed JSON`, { cause: error });
	}
	if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
		throw new Error(`invalid host SDK manifest at ${packageJsonPath}: expected a JSON object`);
	}
	if ((pkg as HostPackageJson).name !== CODING_AGENT_PACKAGE) {
		throw new Error(`invalid host SDK manifest at ${packageJsonPath}: expected "${CODING_AGENT_PACKAGE}"`);
	}
	return pkg as HostPackageJson;
}

type HostPackageSelection =
	| { root: string; cliScript: string }
	| { root: string; packageJson: HostPackageJson; authoritative: boolean };

/** Preserve direct JS launches; extensionless .bin/evoharness launchers must honor explicit roots first. */
function selectPiPackage(deps: HostSpawnDeps): HostPackageSelection | undefined {
	const existsSync = deps.existsSync ?? fs.existsSync;
	const realpathSync = deps.realpathSync ?? fs.realpathSync;
	const argv1 = deps.argv1 ?? process.argv[1];
	const env = deps.env ?? process.env;

	if (argv1) {
		const argvPath = normalizePath(argv1);
		if (isRunnableNodeScript(argvPath, existsSync)) {
			try {
				const canonicalArgvPath = realpathSync(argvPath);
				const root = isRunnableNodeScript(canonicalArgvPath, existsSync)
					? findPiPackageRootFromEntry(canonicalArgvPath)
					: undefined;
				if (root) return { root, cliScript: canonicalArgvPath };
			} catch {
				// Ownership probing is best-effort; an unverified host entry is not a evoharness CLI.
			}
		}
	}

	const root =
		(deps.hostPackageRoot?.trim() || undefined) ??
		(env[CODING_AGENT_PACKAGE_ROOT_ENV]?.trim() || undefined) ??
		resolvePiPackageRoot(argv1) ??
		resolveHostDependencyPiPackageRoot(argv1);
	if (root)
		return {
			root,
			packageJson: readHostPackageJson(path.join(root, "package.json"), deps.readFileSync),
			authoritative: true,
		};

	// Only extension-relative discovery is best-effort, for both SDK and CLI consumers.
	const packageJsonCandidates: Array<() => string | undefined> = [];
	if (deps.resolvePackageJson) packageJsonCandidates.push(deps.resolvePackageJson);
	packageJsonCandidates.push(() => {
		const packageRoot = deps.resolvePackageEntry
			? findPiPackageRootFromEntry(deps.resolvePackageEntry())
			: resolveInstalledHostPackageRoot();
		return packageRoot ? path.join(packageRoot, "package.json") : undefined;
	});
	for (const candidatePackageJson of packageJsonCandidates) {
		try {
			const packageJsonPath = candidatePackageJson();
			if (!packageJsonPath) continue;
			return {
				root: path.dirname(packageJsonPath),
				packageJson: readHostPackageJson(packageJsonPath, deps.readFileSync),
				authoritative: false,
			};
		} catch {
			// No authoritative host root was found; keep probing the extension install.
		}
	}
	return undefined;
}

export function resolvePiCliScript(deps: HostSpawnDeps = {}): string | undefined {
	const selection = selectPiPackage(deps);
	if (!selection) return undefined;
	if ("cliScript" in selection) return selection.cliScript;
	const binField = selection.packageJson.bin;
	const binPath = typeof binField === "string" ? binField : (binField?.evoharness ?? Object.values(binField ?? {})[0]);
	const cli = binPath ? path.resolve(selection.root, binPath) : undefined;
	if (cli && isRunnableNodeScript(cli, deps.existsSync ?? fs.existsSync)) return cli;
	if (selection.authoritative)
		throw new Error(`Selected evoharness package at ${selection.root} has no runnable CLI script`);
	return undefined;
}

export function getHostSpawnCommand(args: string[], deps: HostSpawnDeps = {}): HostSpawnCommand {
	const platform = deps.platform ?? process.platform;
	const env = deps.env ?? process.env;
	const hostBinary = env[EVOHARNESS_SUBAGENT_HOST_BINARY_ENV]?.trim();
	if (hostBinary) {
		if (platform === "win32" && isNodeScriptPath(hostBinary)) {
			return {
				command: deps.execPath ?? process.execPath,
				args: [hostBinary, ...args],
			};
		}
		return { command: hostBinary, args };
	}

	const execPath = deps.execPath ?? process.execPath;
	if (isStandalonePiExecutable(execPath)) {
		return { command: execPath, args };
	}

	const hostCliPath = resolvePiCliScript(deps);
	if (hostCliPath) {
		return {
			command: execPath,
			args: [hostCliPath, ...args],
		};
	}
	if (platform === "win32") {
		throw new Error(
			`Could not resolve the evoharness CLI on Windows. Set ${EVOHARNESS_SUBAGENT_HOST_BINARY_ENV} or ensure ${CODING_AGENT_PACKAGE} is installed.`,
		);
	}

	return { command: "evoharness", args };
}
