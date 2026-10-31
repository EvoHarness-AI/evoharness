# Quickstart

EvoHarness runs in your terminal and works with files on your machine. To use it, you need access to a model through a supported provider. This can be a subscription, an API key, or a local model.

For native Windows setup, read [Windows Setup](windows.md). For Android, read [Termux Setup](termux.md).

## 1. Install EvoHarness

Install EvoHarness with the installer on macOS, Linux, or Windows:

```bash tab="macOS / Linux"
curl -fsSL https://evoharness.dev/install.sh | sh
```

```powershell tab="Windows"
powershell -c "irm https://evoharness.dev/install.ps1 | iex"
```

Both installers pin all dependencies and update EvoHarness with `evoharness update`. Alternatively, install EvoHarness from npm, which does not pin transitive dependencies. This requires Node.js 22.19 or newer:

```bash
npm install -g --ignore-scripts @evoharness/coding-agent
```

EvoHarness does not require dependency lifecycle scripts for a normal npm installation.

With Nix on macOS or Linux, install the latest release from EvoHarness's flake. Nix builds EvoHarness from source:

```bash
nix profile add github:EvoHarness-AI/evoharness/stable
```

Older Nix versions use `nix profile install` instead. Update with `nix profile upgrade evoharness`; `evoharness update` cannot update a Nix installation. To pin a release, use a tag such as `github:EvoHarness-AI/evoharness/v1.0.0`.

Verify the installation:

```bash
evoharness --version
```

## 2. Start EvoHarness

Change to the folder you want EvoHarness to work with, then start it:

```bash
cd /path/to/folder
evoharness
```

The working folder helps EvoHarness discover relevant files, instructions, and configuration. EvoHarness also uses it to group saved sessions.

<p align="center"><img src="images/interactive-mode.png" alt="EvoHarness running in a terminal with a conversation, input editor, and status footer" width="750"></p>

The interface shows your conversation, an editor for prompts and commands, and a footer with the current folder, model, and session status. See [Use EvoHarness in the terminal](usage.md) to learn how to add files, run commands, direct ongoing work, and manage results.

## 3. Choose a model

A **model** generates EvoHarness's responses. A **provider** is the service or account EvoHarness uses to access that model.

In EvoHarness, run:

```text
/login
```

Choose a provider, then follow the prompts to use a subscription or store an API key. Run `/model` afterward if you want to select a different available model.

See [Choose a model and provider](models.md) for supported providers, environment-variable authentication, local models, and custom endpoints.

## 4. Give EvoHarness a task

EvoHarness shows each file read, search, command, and edit it performs. It does not ask before every tool call.

Enter a task that matches your work, for example:

```text
Summarize @meeting-notes.md and save the action items to action-items.md.
```

```text
Explain how this repository is structured and how to run its checks.
```

```text
Compare @previous.csv with @current.csv and summarize the important changes.
```

Type `@` in the editor to search for a file instead of entering its full path. When EvoHarness finishes, review its response and any changed files. Use version control or backups for important work. For untrusted or unattended work, use a container or another sandbox. See [Security](security.md).

## Continue later

EvoHarness saves sessions automatically. Exit EvoHarness, then resume the most recent session for the same working folder with:

```bash
evoharness --continue
```

Use `/resume` to choose another saved session. See [Continue or branch a session](sessions.md) for session naming, branching, compaction, export, and sharing.

## Next steps

- [Use EvoHarness interactively](usage.md) to learn input, commands, shortcuts, and queued messages.
- [Add instructions](configuration.md#context-files) that EvoHarness should follow whenever it works in a folder.
- [Choose a model and provider](models.md).

### Choose how to customize EvoHarness

Start with the least powerful mechanism that meets your need:

| Need | Start with |
|---|---|
| Give EvoHarness persistent instructions for a folder | [`AGENTS.md`](configuration.md#context-files) |
| Reuse a prompt from the `/` menu | [Prompt template](prompt-templates.md) |
| Add task-specific instructions and supporting files | [Skill](skills.md) |
| Add executable tools, commands, or event handlers | [Extension](extensions.md) |
| Build a custom terminal component | [Terminal UI](tui.md) |
| Connect an unsupported model service | [Custom provider](custom-provider.md) |
| Install or distribute several resources | [EvoHarness package](packages.md) |

## Uninstall EvoHarness

If you installed EvoHarness with npm, run:

```bash
npm uninstall -g @evoharness/coding-agent
```

If you used the installer, run it again and choose **Uninstall EvoHarness**:

```bash
curl -fsSL https://evoharness.dev/install.sh | sh
```

If you installed EvoHarness with Nix, run:

```bash
nix profile remove evoharness
```

None of these methods removes configuration, credentials, sessions, or installed EvoHarness packages from `~/.evoharness/agent/`.
