#!/usr/bin/env node
// GitHub REST client for this repository's pull requests. No dependencies and no gh: pull requests are API-only
// objects, while branches and tags stay in git/SSH territory (the `github-evoharness` SSH host alias carries the
// repository owner's identity for those).
//
//   whoami                       Print the token's login and what it may see on the pinned repository.
//   view --pr N                  Print a PR's state, base/head, commit count, and diff size.
//   create --head X --title T --body-file F [--base main] [--draft]
//   comment --pr N --body-file F
//   close --pr N [--comment-file F]   Posts the note first, so the closing reason is on the record.
//
// Four constraints are enforced here and asserted in scripts/github-pr.test.mjs:
//   1. Every write starts with GET /user and refuses unless the token belongs to EXPECTED_LOGIN. A gh login is one
//      active account for the whole machine, and this repository is owned by a different account than the default
//      one, so a forgotten account switch would otherwise open or close work under the wrong name.
//   2. The repository is pinned. Reaching another one requires --allow-repo, which is an escape hatch, not a flag
//      to type routinely; there is deliberately no plain --repo.
//   3. The token only ever appears in the authorization header. Failures print method, path (query dropped), status,
//      and GitHub's own message, never the headers.
//   4. Multi-line text comes from a file, never a command-line argument. Same rule the root AGENTS.md sets for gh.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const API_URL = "https://api.github.com";
const PINNED_REPO = "EvoHarness-AI/evoharness";
const EXPECTED_LOGIN = "EvoHarness-AI";
const TOKEN_FILE = join(homedir(), ".config", "evoharness", "github-pat");
const REPO_SHAPE = /^[\w.-]+\/[\w.-]+$/u;

class UsageError extends Error {}

const sharedOptions = {
	"api-url": { type: "string", default: API_URL },
	"token-file": { type: "string" },
	"allow-repo": { type: "string" },
	"dry-run": { type: "boolean", default: false },
};

function parse(argv, options) {
	return parseArgs({ args: argv, options: { ...sharedOptions, ...options } }).values;
}

function requirePr(value) {
	if (!/^\d+$/u.test(value ?? "")) throw new UsageError("--pr must be a pull request number");
	return value;
}

function requireValue(value, flag) {
	if (!value) throw new UsageError(`${flag} is required`);
	return value;
}

// Only --allow-repo can leave the pinned repository, and a typo there would write to someone else's repo, so the
// value must look like owner/name and is echoed for every command that uses it.
function resolveRepo(values) {
	const requested = values["allow-repo"];
	if (!requested || requested === PINNED_REPO) return PINNED_REPO;
	if (!REPO_SHAPE.test(requested)) throw new UsageError(`--allow-repo wants owner/name, got ${requested}`);
	console.error(`github-pr: --allow-repo targets ${requested}, not the pinned ${PINNED_REPO}`);
	return requested;
}

// A token in a command line would land in shell history and CI logs, so it comes from a file or the environment.
// Sources that yield nothing fall through to the next, and the final message names every place the token could be.
// One exception: an explicit --token-file that is missing or blank is a mistake, not a cue to go look elsewhere,
// because reading a different secret there would write under an identity the operator did not choose.
async function readToken(values) {
	const explicit = values["token-file"];
	const candidates = explicit
		? [await readFile(explicit, "utf8").catch(() => "")]
		: [process.env.EVOHARNESS_GH_TOKEN, await readFile(TOKEN_FILE, "utf8").catch(() => "")];
	for (const candidate of candidates) {
		const token = (candidate ?? "").trim();
		if (token) return token;
	}
	throw new UsageError(
		`No usable token${explicit ? ` in ${explicit}` : ""}. Put one in --token-file, $EVOHARNESS_GH_TOKEN, or ${TOKEN_FILE}. Never in a command line, the repository, or an issue.`,
	);
}

async function readTextFile(path, flag) {
	if (!path) throw new UsageError(`${flag} is required: multi-line text comes from a file, not an argument`);
	const text = await readFile(path, "utf8").catch(() => {
		throw new UsageError(`${flag}: cannot read ${path}`);
	});
	if (!text.trim()) throw new UsageError(`${flag}: ${path} is empty`);
	return text;
}

function describeFailure(method, url, status, text) {
	const summary = text.length > 400 ? `${text.slice(0, 400)}...` : text;
	const hint = {
		401: " (token missing, expired, or revoked)",
		403: " (wrong account, or the token lacks Pull requests read and write on this repository)",
		// A fine-grained token with no access reports absence rather than denial, so 404 is a permissions answer here.
		404: " (repository or pull request not visible to this token)",
		422: " (the base/head pair does not exist, or the PR is already merged)",
	}[status];
	return `${method} ${new URL(url).pathname} failed: ${status}${hint ?? ""} ${summary}`;
}

async function call(method, url, token, payload) {
	const response = await fetch(url, {
		method,
		headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
		body: payload === undefined ? undefined : JSON.stringify(payload),
	});
	const text = await response.text();
	if (!response.ok) throw new Error(describeFailure(method, url, response.status, text));
	if (!text) return {};
	return JSON.parse(text);
}

// One gate for every write, so adding a subcommand cannot skip the identity check by accident.
async function assertWriteIdentity(url, token) {
	const me = await call("GET", `${url}/user`, token);
	if (me.login !== EXPECTED_LOGIN) {
		throw new Error(`token belongs to ${me.login}; writes are only allowed as ${EXPECTED_LOGIN} (gh keeps one machine-wide active account, this script does not)`);
	}
}

async function write(values, method, path, payload) {
	const repo = resolveRepo(values);
	const base = values["api-url"];
	if (values["dry-run"]) {
		console.log(`dry run: ${method} ${new URL(`${base}/repos/${repo}${path}`).pathname}`);
		console.log(JSON.stringify(payload, null, "\t"));
		return;
	}
	const token = await readToken(values);
	await assertWriteIdentity(base, token);
	const result = await call(method, `${base}/repos/${repo}${path}`, token, payload);
	console.log(`${method} ${path} ok: ${result.html_url ?? `state ${result.state ?? "ok"}`}`);
}

async function whoami(argv) {
	const values = parse(argv, {});
	const base = values["api-url"];
	const token = await readToken(values);
	const me = await call("GET", `${base}/user`, token);
	const repo = await call("GET", `${base}/repos/${resolveRepo(values)}`, token);
	const granted = Object.entries(repo.permissions ?? {})
		.filter(([, allowed]) => allowed)
		.map(([name]) => name);
	console.log(`login: ${me.login} (type ${me.type ?? "unknown"})`);
	console.log(`repo: ${repo.full_name}, default branch ${repo.default_branch}, role ${repo.role_name ?? "none"}`);
	console.log(`repo permissions visible to this token: ${granted.join(", ") || "none"}`);
	console.log(`writes require login ${EXPECTED_LOGIN}`);
}

async function view(argv) {
	const values = parse(argv, { pr: { type: "string" } });
	const number = requirePr(values.pr);
	const base = values["api-url"];
	const repo = resolveRepo(values);
	const token = await readToken(values);
	const pulls = `${base}/repos/${repo}/pulls/${number}`;
	const [pr, commits] = await Promise.all([
		call("GET", pulls, token),
		call("GET", `${pulls}/commits`, token),
	]);
	console.log(`#${pr.number} ${pr.title}`);
	console.log(`state: ${pr.state}${pr.draft ? " (draft)" : ""}, merged: ${pr.merged ?? false}`);
	console.log(`mergeable: ${pr.mergeable ?? "unknown"}, ${pr.mergeable_state ?? "unknown"}`);
	console.log(`base: ${pr.base?.ref} <- head: ${pr.head?.ref} (${pr.head?.sha?.slice(0, 7) ?? "?"})`);
	console.log(`commits: ${commits.length}, +${pr.additions ?? "?"} -${pr.deletions ?? "?"}`);
	console.log(`url: ${pr.html_url}`);
}

async function create(argv) {
	const values = parse(argv, {
		head: { type: "string" },
		base: { type: "string", default: "main" },
		title: { type: "string" },
		"body-file": { type: "string" },
		draft: { type: "boolean", default: false },
	});
	const payload = {
		title: requireValue(values.title, "--title"),
		head: requireValue(values.head, "--head"),
		base: values.base,
		body: await readTextFile(values["body-file"], "--body-file"),
		draft: values.draft,
	};
	await write(values, "POST", "/pulls", payload);
}

async function comment(argv) {
	const values = parse(argv, { pr: { type: "string" }, "body-file": { type: "string" } });
	const number = requirePr(values.pr);
	const payload = { body: await readTextFile(values["body-file"], "--body-file") };
	await write(values, "POST", `/issues/${number}/comments`, payload);
}

// The note goes first: a closed PR with no closing reason reads as an accident, and the branch is kept either way.
async function close(argv) {
	const values = parse(argv, { pr: { type: "string" }, "comment-file": { type: "string" } });
	const number = requirePr(values.pr);
	if (values["comment-file"]) {
		await write(values, "POST", `/issues/${number}/comments`, {
			body: await readTextFile(values["comment-file"], "--comment-file"),
		});
	}
	await write(values, "PATCH", `/pulls/${number}`, { state: "closed" });
}

const USAGE = `Usage:
  node scripts/github-pr.mjs whoami
  node scripts/github-pr.mjs view --pr <n>
  node scripts/github-pr.mjs create --head <branch> --title <text> --body-file <path> [--base main] [--draft]
  node scripts/github-pr.mjs comment --pr <n> --body-file <path>
  node scripts/github-pr.mjs close --pr <n> [--comment-file <path>]

Token sources, in order: --token-file, $EVOHARNESS_GH_TOKEN, ${TOKEN_FILE}
Common flags: --api-url <base>, --allow-repo <owner/name>, --dry-run`;

const commands = { whoami, view, create, comment, close };
const [command, ...argv] = process.argv.slice(2);
try {
	if (!commands[command]) throw new UsageError(USAGE);
	await commands[command](argv);
} catch (error) {
	console.error(error instanceof UsageError ? error.message : `github-pr: ${error.message}`);
	process.exit(1);
}
