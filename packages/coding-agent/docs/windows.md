# Run EvoHarness on Windows

Run EvoHarness either as a native Windows process or inside Windows Subsystem for Linux (WSL). Native Windows uses Git Bash by default for Bash commands and can optionally expose PowerShell to the model. EvoHarness inside WSL uses the Linux environment and its Bash installation.

Follow the main [Quickstart](quickstart.md) to install and authenticate EvoHarness. Use this page to choose and configure its command environment.

## Choose native Windows or WSL

| Environment | Command environment | Use it when |
|---|---|---|
| Native Windows with Git Bash | Git Bash for the built-in `bash` tool and `!` commands | Your files and development tools primarily live on Windows |
| Native Windows with the `powershell` tool | PowerShell for model tool calls; Bash remains available for `!` commands | The task depends on PowerShell modules or Windows-native commands |
| WSL | Linux Bash and tools inside the selected WSL distribution | Your files and toolchain already live in Linux or WSL |

## Use Git Bash on native Windows

For most native Windows users, installing [Git for Windows](https://git-scm.com/download/win) is sufficient.

EvoHarness resolves Bash in this order:

1. `shellPath` from `~/.evoharness/agent/settings.json`
2. Git Bash at `%ProgramFiles%\Git\bin\bash.exe`
3. Git Bash at `%ProgramFiles(x86)%\Git\bin\bash.exe`
4. `bash.exe` on `PATH`, including Cygwin, MSYS2, or legacy WSL Bash

Start EvoHarness and enter this command to verify the shell:

```text
!printf 'Bash is working\n'
```

If EvoHarness cannot find Bash, it reports the locations it checked. Install Git for Windows, put another Bash executable on `PATH`, or configure `shellPath`.

## Let the model use PowerShell

The optional `powershell` tool runs commands through `pwsh.exe` when available, then falls back to Windows PowerShell. It starts PowerShell with `-NoProfile -NonInteractive -ExecutionPolicy Bypass`. Administrator-enforced execution policies can still take precedence.

PowerShell discovery checks these locations in order:

1. `pwsh.exe` on `PATH`
2. `%ProgramFiles%\PowerShell\7\pwsh.exe`
3. `powershell.exe` on `PATH`
4. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`

To replace the model-facing `bash` tool with `powershell`, add this to `~/.evoharness/agent/settings.json`:

```json
{
  "defaultTools": ["read", "powershell", "edit", "write"]
}
```

`["-bash", "+powershell"]` does the same while keeping any other default tools you configured.

Restart EvoHarness, then ask it to run a harmless PowerShell command. The `!` and `!!` editor commands continue to use Bash. The `powershell` tool is available only when EvoHarness runs as a native Windows process.

See [Settings](settings.md#tools) for other tool combinations.

## WSL

WSL path conversion on Windows and extra Git branch polling in WSL recognize `/mnt/<drive>`, not custom mount roots.

When using the legacy WSL `bash.exe` launcher from Windows, EvoHarness sends commands over stdin to avoid command-line quoting problems.

## Use a custom Bash executable

Set `shellPath` when Bash is installed somewhere EvoHarness does not discover automatically:

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```

JSON uses backslashes for escape sequences. When you write a Windows path with backslashes, write each backslash twice, as shown above.

See [Configure shell commands](shell-aliases.md) for command prefixes, aliases, and the complete shell-resolution behavior.

## Supply `fd` and `ripgrep` without a download

The `find` tool and file autocomplete use `fd`; the `grep` tool uses `ripgrep` (`rg`). On first startup EvoHarness downloads both from GitHub Releases into `%USERPROFILE%\.evoharness\agent\bin`. When that download is blocked, installing either one yourself is enough to stop it, because EvoHarness looks for an existing copy before downloading, in this order:

1. `EVOHARNESS_FD_PATH` / `EVOHARNESS_RG_PATH`
2. `%USERPROFILE%\.evoharness\agent\bin`
3. `PATH`
4. `winget` links (`%LOCALAPPDATA%\Microsoft\WinGet\Links`), Scoop shims, Chocolatey, and the `ripgrep` bundled with VS Code

```powershell
winget install BurntSushi.ripgrep.MSVC
winget install sharkdp.fd
```

A shell started before the install keeps the old `PATH`, but step 4 still finds the new binary. Copying `fd.exe` or `rg.exe` into `%USERPROFILE%\.evoharness\agent\bin` also works and is checked first among the automatic locations.

A failed download is not retried on every tool call: EvoHarness waits five minutes before the next attempt and prints how to install the tool by hand. Restart EvoHarness to retry immediately.

## Configure Windows Terminal

Windows Terminal reserves or rewrites some modified keys. See [Windows Terminal](terminal-setup.md#windows-terminal) to configure `Shift+Enter` and `Alt+Enter`, and [Keybindings](keybindings.md) for EvoHarness's Windows and WSL shortcut defaults.
