#!/usr/bin/env node
/**
 * Guard against rename residue in the vendored web app (apps/evoharness-web).
 *
 * The port (apps/evoharness-web/docs/spec.md) mechanically renamed the upstream
 * pi-web branding, package names and environment variables. This guard keeps
 * the rename complete: any return of the old tokens turns red, so a copied-in
 * upstream patch cannot silently reintroduce them.
 *
 * Deliberate allowances (each reviewed, not oversights):
 * - LICENSE / README.md / docs/ may name the upstream projects (attribution
 *   and the ported architecture notes describe them).
 * - `pi-mcp-add` / `pi-help` are i18n keys for the "import MCP servers from
 *   the pi CLI" feature — the feature imports FROM upstream pi, so the name
 *   stays.
 * - `pi-codegraph` / `pi-gui` / `pi-agent-test` are opaque fixture strings in
 *   tests, not brand references.
 * - The PI_* identifiers listed in ALLOWED_PI_IDENTIFIERS are local constants
 *   or simulated user data (see apps/evoharness-web/docs/spec.md Annex D).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const APP = join(ROOT, "apps", "evoharness-web");
const SCAN_DIRS = ["app", "lib", "components", "hooks", "bin", "scripts", "e2e", "public"];
const SCAN_FILES = ["next.config.ts", "postcss.config.mjs", "tailwind.config.ts", "tsconfig.json", "eslint.config.mjs", "instrumentation.ts", "instrumentation-node.ts", "proxy.ts", "package.json"];
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx|mjs|cjs|css|html|webmanifest|json|md)$/u;

const RENAMED_ENV_NAMES = [
	"PI_WEB_PASSWORD", "PI_CODING_AGENT_DIR", "PI_WEB_DISABLE_MCP", "PI_OFFLINE",
	"PI_WEB_IDLE_TIMEOUT_MS", "PI_WEB_HOSTNAME", "PI_AGENT_HOME", "PI_WEB_VERBOSE",
	"PI_WEB_SSE_BACKLOG_LIMIT_BYTES", "PI_DESKTOP_API_TOKEN", "PI_WEB_FIXTURE_PID_FILE",
	"PI_WEB_ALLOW_UNAUTHENTICATED", "PI_WEB_SHUTDOWN_DEADLINE_MS", "PI_WEB_SESSION_COOKIE",
	"PI_WEB_NO_OPEN", "PI_WEB_SESSION_MAX_AGE", "PI_WEB_ADD_TEST_TOKEN", "PI_PACKAGE_DIR",
	"PI_WEB_TEST_REFERENCED", "PI_WEB_MCP_IDLE_MS", "PI_WEB_FIXTURE_FAIL",
	"PI_WEB_FIXTURE_ENV_FILE", "PI_WEB_DESKTOP_BUILD", "PI_WEB_FIXTURE_IGNORE_TERM",
	"PI_WEB_ADD_TEST_API_TOKEN", "PI_WEB_FIXTURE_ODD_TOOLS", "PI_WEB_FIXTURE_INIT_ERROR",
	"PI_WEB_DISCOVERY_TEST_TOKEN", "PI_PACKAGED_TERMINAL_OK", "PI_DESKTOP_INSTANCE_ID",
	"PI_WEB_TEST_INHERITED", "PI_WEB_SKIP_VERSION_CHECK", "PI_WEB_PUSH_SUBJECT",
	"PI_WEB_PERF", "PI_WEB_INTERNALS_TEST_MISSING", "PI_WEB_AUTH_USERNAME",
	"PI_WEB_ALLOWED_HOSTS", "PI_DESKTOP_COMPILE_CACHE_DIR", "PI_WEB_TAG",
	"PI_WEB_PASSWORD_HINT", "PI_WEB_DISABLE_SCHEDULER", "PI_SKIP_VERSION_CHECK",
	"PI_WEB_PREFIX", "PI_WEB_PARENT_PID",
];
const ALLOWED_PI_IDENTIFIERS = new Set([
	"PI_USER_SETTING", "PI_REFERENCE", "PI_PACKAGE_COMMANDS",
	"PI_ADD_OPTIONS", "PI_OPTION_ALIASES", "PI_HTTP_ONLY", "PI_STDIO_ONLY",
]);
const ALLOWED_PI_PREFIXES = ["pi-mcp-add", "pi-help", "pi-codegraph", "pi-gui", "pi-agent-test"];
// Paths where upstream-project names are the subject matter (attribution and
// ported notes), not branding residue.
const BRAND_WHITELIST_PREFIXES = ["LICENSE", "README.md", "docs/"];

const TOKEN_CHECKS = [
	[/@earendil-works/gu, "upstream npm scope"],
	[/@agegr/gu, "upstream npm scope"],
	[/abcwyc/gu, "upstream repository owner"],
	[/earendil-works/gu, "upstream repository owner"],
	[/\bpi-agent-desktop\b/gu, "upstream distribution name"],
	[/\bpi-web\b/gu, "upstream product name"],
	[/__pi[A-Za-z0-9]/gu, "upstream globalThis key"],
	[/\bpi_web_session\b/gu, "upstream cookie name"],
	[/\bPi Web\b/gu, "upstream product name"],
	[/\bPi Agent\b/gu, "upstream product name"],
	[/\bpi-cwd\b/gu, "upstream scratch directory"],
	[/X-Pi-[A-Z]/gu, "upstream header name"],
	[/\.pi(?=[/"'\\])|~\/\.pi\b/gu, "upstream config directory literal"],
	[/piWeb[A-Z]/gu, "upstream camelCase identifier"],
	[/PiWeb[A-Za-z0-9]/gu, "upstream PascalCase identifier"],
];

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".next-desktop") continue;
			yield* walk(join(dir, entry.name));
			continue;
		}
		if (entry.isFile() && SOURCE.test(entry.name)) yield join(dir, entry.name);
	}
}

const files = [];
for (const dir of SCAN_DIRS) {
	const absolute = join(APP, dir);
	try {
		if (statSync(absolute).isDirectory()) files.push(...walk(absolute));
	} catch {
		console.error(`check-web-names: missing scan directory ${dir} — run from the repo root`);
		process.exit(1);
	}
}
for (const file of SCAN_FILES) {
	try {
		if (statSync(join(APP, file)).isFile()) files.push(join(APP, file));
	} catch {}
}

const failures = [];
for (const file of files) {
	const key = relative(ROOT, file).split(sep).join("/");
	const text = readFileSync(file, "utf8");
	const lines = text.split("\n");
	for (const [index, line] of lines.entries()) {
		const report = (token, why) => failures.push(`${key}:${index + 1}: ${token} (${why})`);

		for (const name of RENAMED_ENV_NAMES) {
			if (new RegExp(`\\b${name}\\b`, "u").test(line)) report(name, "renamed environment variable");
		}
		for (const match of line.matchAll(/\bPI_[A-Z][A-Z0-9_]*\b/gu)) {
			if (!ALLOWED_PI_IDENTIFIERS.has(match[0])) report(match[0], "unrecognized PI_ token");
		}
		for (const match of line.matchAll(/\bpi-[a-z0-9-]+/gu)) {
			const token = match[0];
			if (ALLOWED_PI_PREFIXES.some((allowed) => token === allowed || token.startsWith(`${allowed}-`) || token.startsWith(`${allowed}.`))) continue;
			report(token, "unrecognized pi- literal");
		}
		const brandAllowed = BRAND_WHITELIST_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}/`));
		if (!brandAllowed) {
			for (const [pattern, why] of TOKEN_CHECKS) {
				for (const match of line.matchAll(pattern)) report(match[0], why);
			}
		}
	}
}

if (failures.length > 0) {
	console.error(`check-web-names: ${failures.length} rename residue site(s):`);
	for (const failure of failures) console.error(`  ${failure}`);
	console.error("Old tokens must stay out of apps/evoharness-web; extend the allowances");
	console.error("in this script (with a reason) only for reviewed, deliberate cases.");
	process.exit(1);
}
console.log(`Rename residue guard holds (${files.length} files scanned).`);
