import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), "github-pr.mjs");
// Any token value reaching stdout, stderr, or a request body other than the header fails these assertions.
const TOKEN = "github_pat_sentinel_value";
const REPO_PATH = "/repos/EvoHarness-AI/evoharness";

function temporaryFile(t, name, contents) {
	const directory = mkdtempSync(join(tmpdir(), "evoharness-github-pr-test-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const path = join(directory, name);
	writeFileSync(path, contents);
	return path;
}

/**
 * Stands in for api.github.com and records every request. `login` is the identity `/user` reports, and
 * `writeStatus` makes writes fail that way while reads keep working.
 */
async function startServer(t, { login = "EvoHarness-AI", writeStatus, writeMessage = "Forbidden" } = {}) {
	const requests = [];
	const server = createServer(async (req, res) => {
		let body = "";
		for await (const chunk of req) body += chunk;
		const path = (req.url ?? "/").split("?")[0];
		requests.push({ method: req.method, path, authorization: req.headers.authorization, body });
		res.setHeader("content-type", "application/json");
		if (path === "/user") return void res.end(JSON.stringify({ login, type: "User" }));
		if (path === REPO_PATH) {
			return void res.end(
				JSON.stringify({
					full_name: "EvoHarness-AI/evoharness",
					default_branch: "main",
					role_name: "admin",
					permissions: { admin: true, maintain: false, push: true, triage: true, pull: true },
				}),
			);
		}
		if (path === `${REPO_PATH}/pulls/2/commits`) return void res.end(JSON.stringify([{ sha: "a" }, { sha: "b" }]));
		if (path === `${REPO_PATH}/pulls/2` && req.method === "GET") {
			return void res.end(
				JSON.stringify({
					number: 2,
					title: "Feat/subagents port",
					state: "open",
					draft: false,
					merged: false,
					mergeable: true,
					mergeable_state: "blocked",
					base: { ref: "main" },
					head: { ref: "feat/subagents-port", sha: "a57cdc1a75c720ad66cc95072e329761cdc9d61b" },
					additions: 363745,
					deletions: 77,
					html_url: "https://github.com/EvoHarness-AI/evoharness/pull/2",
				}),
			);
		}
		if (req.method === "POST" || req.method === "PATCH") {
			if (writeStatus) {
				res.statusCode = writeStatus;
				return void res.end(JSON.stringify({ message: writeMessage }));
			}
			return void res.end(JSON.stringify({ number: 3, state: "closed", html_url: `http://localhost${path}` }));
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ message: "Not Found" }));
	});
	await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
	t.after(() => server.close());
	return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

// The inherited environment must not decide which token the script sees.
function invoke(server, tokenFile, args) {
	const { EVOHARNESS_GH_TOKEN: _omitted, ...env } = process.env;
	return run(process.execPath, [script, ...args, "--api-url", server.url, "--token-file", tokenFile], { env });
}

test("whoami reports the token login and the repository role", async (t) => {
	const server = await startServer(t);

	const { stdout } = await invoke(server, temporaryFile(t, "pat", `${TOKEN}\n`), ["whoami"]);

	assert.match(stdout, /login: EvoHarness-AI \(type User\)/);
	assert.match(stdout, /role admin/);
	assert.match(stdout, /admin, push, triage, pull/);
});

test("create checks the identity first, then posts exactly title, head, base, body, and draft", async (t) => {
	const server = await startServer(t);
	const bodyFile = temporaryFile(t, "pr-body.md", "## Why\n\nBecause.\n");

	const { stdout } = await invoke(
		server,
		temporaryFile(t, "pat", `${TOKEN}\n`),
		["create", "--head", "chore/example", "--title", "chore: example", "--body-file", bodyFile],
	);

	assert.deepEqual(
		server.requests.map(({ method, path }) => ({ method, path })),
		[
			{ method: "GET", path: "/user" },
			{ method: "POST", path: `${REPO_PATH}/pulls` },
		],
	);
	assert.deepEqual(JSON.parse(server.requests[1].body), {
		title: "chore: example",
		head: "chore/example",
		base: "main",
		body: "## Why\n\nBecause.\n",
		draft: false,
	});
	assert.match(stdout, /POST \/pulls ok/);
});

test("create refuses to write under another account and sends no write", async (t) => {
	const server = await startServer(t, { login: "Ember452" });

	await assert.rejects(
		invoke(server, temporaryFile(t, "pat", `${TOKEN}\n`), [
			"create",
			"--head",
			"x",
			"--title",
			"t",
			"--body-file",
			temporaryFile(t, "b.md", "body"),
		]),
		/token belongs to Ember452/,
	);
	assert.equal(server.requests.filter((request) => request.method !== "GET").length, 0);
});

test("close posts the closing note before flipping the state", async (t) => {
	const server = await startServer(t);

	await invoke(server, temporaryFile(t, "pat", `${TOKEN}\n`), [
		"close",
		"--pr",
		"2",
		"--comment-file",
		temporaryFile(t, "note.md", "Closed as not planned."),
	]);

	assert.deepEqual(
		server.requests.filter((request) => request.method !== "GET").map(({ method, path, body }) => ({ method, path, body })),
		[
			{ method: "POST", path: `${REPO_PATH}/issues/2/comments`, body: '{"body":"Closed as not planned."}' },
			{ method: "PATCH", path: `${REPO_PATH}/pulls/2`, body: '{"state":"closed"}' },
		],
	);
});

test("a rejected write names the status and never repeats the token", async (t) => {
	const server = await startServer(t, { writeStatus: 403 });

	await assert.rejects(
		invoke(server, temporaryFile(t, "pat", TOKEN), [
			"close",
			"--pr",
			"2",
		]),
		(error) => {
			assert.match(error.stderr, /PATCH .* failed: 403 \(wrong account, or the token lacks Pull requests read and write/);
			assert.equal(error.stderr.includes(TOKEN), false);
			return true;
		},
	);
	// The token appears in exactly one place per request: the authorization header.
	for (const request of server.requests) {
		assert.equal(request.authorization, `Bearer ${TOKEN}`);
		assert.equal(request.body.includes(TOKEN), false);
		assert.equal(request.path.includes(TOKEN), false);
	}
});

test("dry run sends nothing and shows the resolved path and payload", async (t) => {
	const server = await startServer(t);

	const { stdout } = await invoke(
		server,
		temporaryFile(t, "unused", "no request is made, so no token is read\n"),
		["close", "--pr", "2", "--dry-run"],
	);

	assert.equal(server.requests.length, 0);
	assert.match(stdout, new RegExp(`dry run: PATCH ${REPO_PATH}/pulls/2`));
	assert.match(stdout, /"state": "closed"/);
});

test("an explicit --token-file that is missing is reported and never falls through to another secret", async (t) => {
	const server = await startServer(t);
	const missing = join(dirname(temporaryFile(t, "holder", "")), "no-such-pat-file");

	await assert.rejects(invoke(server, missing, ["close", "--pr", "2"]), (error) => {
		assert.match(error.stderr, /No usable token in .*no-such-pat-file/);
		assert.match(error.stderr, /--token-file, \$EVOHARNESS_GH_TOKEN/);
		return true;
	});
	assert.equal(server.requests.length, 0);
});

test("there is no plain --repo; leaving the pinned repository needs --allow-repo", async (t) => {
	const server = await startServer(t);
	const tokenFile = temporaryFile(t, "pat", TOKEN);

	await assert.rejects(invoke(server, tokenFile, ["view", "--pr", "2", "--repo", "other/thing"]), /Unknown option/);

	await invoke(server, tokenFile, ["close", "--pr", "2", "--allow-repo", "other/thing"]);
	assert.equal(
		server.requests.some((request) => request.method === "PATCH" && request.path === "/repos/other/thing/pulls/2"),
		true,
	);

	await assert.rejects(invoke(server, tokenFile, ["close", "--pr", "2", "--allow-repo", "not-a-repo"]), (error) => {
		assert.match(error.stderr, /--allow-repo wants owner\/name/);
		return true;
	});
});
