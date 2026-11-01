import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A Git Bash for the suites that assert POSIX shell semantics (`printf`, `; exit 0`,
 * `$i` loops). Outside Windows this is undefined and the daemons' own default is used.
 *
 * The suites used to guess `%ProgramFiles%\Git\bin\bash.exe`, which is simply wrong for
 * a portable, per-user or other-drive install - the spawn died with ENOENT and looked
 * like a platform gap. Derive the location from the git that is already on PATH instead,
 * the same way the runtime resolvers do (D-011 in docs/kernel/divergence.md).
 *
 * Returns undefined when no POSIX shell is reachable, so a caller can skip with that
 * reason rather than report a missing toolchain as a defect.
 */
export const posixShell: string | undefined = process.platform === "win32" ? findGitBash() : undefined;

/** True when this platform needs a POSIX shell and none can be found. */
export const posixShellMissing = process.platform === "win32" && posixShell === undefined;

function findGitBash(): string | undefined {
	for (const candidate of gitBashCandidates()) {
		if (existsSync(candidate)) return candidate;
	}
	return bashOnPath();
}

function gitBashCandidates(): string[] {
	const git = firstPathResult("where", ["git.exe"]);
	if (!git) return [];
	const gitDirectory = dirname(git);
	const root = dirname(gitDirectory);
	// Git for Windows keeps bash.exe under the install root; PATH usually carries only
	// the git command directory. The third form covers a git whose directory is `bin`.
	return [join(root, "bin", "bash.exe"), join(root, "usr", "bin", "bash.exe"), join(gitDirectory, "bash.exe")];
}

function bashOnPath(): string | undefined {
	const found = firstPathResult("where", ["bash.exe"]);
	return found && existsSync(found) ? found : undefined;
}

function firstPathResult(command: string, args: string[]): string | undefined {
	try {
		const result = spawnSync(command, args, { encoding: "utf-8", timeout: 5000, windowsHide: true });
		if (result.status !== 0 || !result.stdout) return undefined;
		return result.stdout.trim().split(/\r?\n/)[0] || undefined;
	} catch {
		return undefined;
	}
}
