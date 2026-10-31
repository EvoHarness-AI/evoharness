"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const CLI_OPTIONS = {
  port: { type: "string", short: "p" },
  hostname: { type: "string", short: "H" },
  "no-open": { type: "boolean" },
  verbose: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
};

function isEnabled(value) {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

function isVerboseLogging(env = process.env) {
  return isEnabled(env.EVOHARNESS_WEB_VERBOSE);
}

function normalizePort(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Port must be a non-negative integer.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error("Port must be between 0 and 65535.");
  }

  return String(port);
}

function getHelpText() {
  return `Usage: evoharness-web [options]

Start the EvoHarness UI server.

Options:
  -p, --port <port>          Server port (default: 30141, or PORT)
  -H, --hostname <host>      Bind hostname (default: 127.0.0.1, or EVOHARNESS_WEB_HOSTNAME)
      --no-open              Do not open a browser automatically
  -v, --verbose              Show detailed terminal diagnostics (no payloads)
  -h, --help                 Show this help message and exit

Environment:
  PORT                       Default port when --port is omitted
  EVOHARNESS_WEB_HOSTNAME            Default hostname when --hostname is omitted
  EVOHARNESS_WEB_NO_OPEN             Set to 1/true/yes/on to disable browser open
  EVOHARNESS_WEB_VERBOSE             Set to 1/true/yes/on for detailed terminal diagnostics
  EVOHARNESS_WEB_PASSWORD            Enable browser password login and API Basic Auth
  EVOHARNESS_WEB_ALLOW_UNAUTHENTICATED  Set to 1 to listen beyond loopback without a password
  EVOHARNESS_WEB_ALLOWED_HOSTS       Extra exact proxy/custom hostnames, comma-separated
  EVOHARNESS_WEB_SKIP_VERSION_CHECK  Set to 1 to disable EvoHarness update checks
  EVOHARNESS_WEB_IDLE_TIMEOUT_MS     Session idle timeout in ms (0 disables; default 600000)
  EVOHARNESS_WEB_SHUTDOWN_DEADLINE_MS  Shutdown wait for extensions in ms (default 5000)
`;
}

function parseLaunchOptions(args = process.argv.slice(2), env = process.env) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args,
      options: CLI_OPTIONS,
      strict: true,
      allowPositionals: true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const err = new Error(`${message}\nUse --help to see available options.`);
    err.code = "ERR_PARSE_ARGS_UNKNOWN_OPTION";
    throw err;
  }

  if (values.help) {
    return { help: true };
  }

  if (positionals.length > 0) {
    throw new Error(
      `Unexpected argument(s): ${positionals.join(" ")}\nUse --help to see available options.`,
    );
  }

  return {
    help: false,
    port: normalizePort(values.port ?? env.PORT ?? "30141"),
    hostname: values.hostname ?? env.EVOHARNESS_WEB_HOSTNAME ?? "127.0.0.1",
    openBrowser: !values["no-open"] && !isEnabled(env.EVOHARNESS_WEB_NO_OPEN),
    verbose: Boolean(values.verbose) || isVerboseLogging(env),
  };
}

module.exports = { parseLaunchOptions, getHelpText, isVerboseLogging };
