# EvoHarness

> A general-purpose agent harness, not just a coding agent.

EvoHarness runs **one** agent loop and extends it from the outside: capabilities register tools,
observations and prompt sections instead of patching the core. This repository is the reference
distribution — a terminal agent, an RPC surface and an SDK built on the same loop.

## Build from source

```bash
git clone https://github.com/EvoHarness-AI/evoharness
cd evoharness
npm ci --ignore-scripts
npm run build:offline
node packages/coding-agent/dist/bundle/cli.js
```

Add `npm link -w @evoharness/coding-agent` (or a shell alias) to run it as `evoharness` from any
directory. The npm package and hosted installers will be documented here once they are published.

EvoHarness requires Node.js 22.19 or newer. A normal npm installation needs no dependency
lifecycle scripts.

## First run

```bash
evoharness            # start in the current directory
evoharness --help     # flags, modes and subcommands
```

Either export a provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) or run `/login` inside the
session. `--offline` disables startup network operations.

## Where things are documented

| Question | File |
|---|---|
| What to read first, writing rules, language policy | [`docs/README.md`](docs/README.md) |
| Where code goes, what not to build, when a directory may appear | [`docs/structure.md`](docs/structure.md) |
| What each package does today, and where a change belongs right now | [`packages/README.md`](packages/README.md) |
| How a request flows at runtime | [`docs/architecture.md`](docs/architecture.md) |
| Can the kernel change, and how is a change recorded | [`KERNEL.md`](KERNEL.md) |
| Kernel decisions and deliberate deviations (`D-xxx`) | [`docs/kernel/divergence.md`](docs/kernel/divergence.md) |
| CLI, configuration, extensions, themes, SDK | [`packages/coding-agent/docs/`](packages/coding-agent/docs/) |

## Status

Pre-release. Versions stay in `0.0.x`; breaking changes are expected and each one is recorded in
[`docs/kernel/divergence.md`](docs/kernel/divergence.md).
