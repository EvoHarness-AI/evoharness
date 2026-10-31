# EvoHarness

EvoHarness is an extensible AI agent that works from your terminal. Give it a goal and a working folder, and it can inspect files, run commands, edit content, and work through multi-step tasks.

Use EvoHarness for software development, research notes, writing projects, data files, or hobby work. You can use EvoHarness as is, prompt it to adapt itself to your workflow, or build other applications powered by EvoHarness using the SDK.

## Start using EvoHarness

New to EvoHarness? Follow the [Quickstart](quickstart.md) to install EvoHarness, connect a model, and complete your first task.

If EvoHarness is already installed, choose what you want to do:

- [Use EvoHarness interactively](usage.md) to add files, run commands, direct ongoing work, and export results.
- [Choose a model](models.md) or connect a subscription, API key, local model, or compatible endpoint.
- [Continue or branch a session](sessions.md) to resume work or explore another approach without losing history.
- [Configure EvoHarness](configuration.md) for your preferences, working folders, instructions, and reusable resources.
- [Understand how EvoHarness works](how-evoharness-works.md), including tools, context, sessions, and the agent loop.

## Customize EvoHarness

EvoHarness can reuse prompts, load specialized instructions, add executable integrations, change its terminal interface, connect model services, and distribute these resources as packages.
Use the [Quickstart customization chooser](quickstart.md#choose-how-to-customize-evoharness) to select the smallest mechanism that meets your need.

## Automate or embed EvoHarness

- Use [print mode](cli.md#invocation-and-output) for one-off and scripted tasks.
- Use [JSON event stream mode](json.md) to consume structured events from one run.
- Use [RPC mode](rpc.md) to control a separate EvoHarness process.
- Use the [TypeScript SDK](sdk.md) to run EvoHarness inside an application.

## Find reference and setup information

Use the reference pages to look up [CLI options](cli.md), [settings](settings.md), [providers](providers.md), [keybindings](keybindings.md), and [environment variables](environment-variables.md).

For platform-specific help, see [Terminal Setup](terminal-setup.md), [Windows](windows.md), [tmux](tmux.md), [Termux on Android](termux.md), or [Containerization](containerization.md).

## Work safely

EvoHarness's tools and extensions run with the permissions of the EvoHarness process. Project trust controls which project resources EvoHarness loads, but it does not sandbox tool calls. Review [Security](security.md) before using untrusted files, repositories, extensions, or unattended automation.
