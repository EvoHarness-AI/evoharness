import { getEvoharnessWebSettingsPath, readStored, updateEvoharnessWebSettings } from "./artifact-settings";
import { discoverTerminalShells, type TerminalShell } from "./terminal-shells";
import type { TerminalSettingsResponse } from "./api-types";
import { samePath } from "./paths";

export function readTerminalShellPreference(path = getEvoharnessWebSettingsPath()): string {
  const value = readStored(path).terminalShell;
  return typeof value === "string" && value ? value : "auto";
}

export function writeTerminalShellPreference(shell: string, path = getEvoharnessWebSettingsPath()): void {
  updateEvoharnessWebSettings({ terminalShell: shell }, path);
}

export function getTerminalSettings(): TerminalSettingsResponse {
  const { shells, defaultPath } = discoverTerminalShells();
  const shell = readTerminalShellPreference();
  const selected = shells.find(option => samePath(option.path, shell));
  return { shell: selected?.path ?? shell, defaultShell: shells.find(option => option.path === defaultPath)?.label ?? null,
    options: shells.map(option => ({ value: option.path, label: option.label })),
    unavailable: shell !== "auto" && !selected };
}

export function resolveTerminalShell(): TerminalShell {
  const preference = readTerminalShellPreference();
  const { shells, defaultPath } = discoverTerminalShells();
  const selected = shells.find(shell => samePath(shell.path, (preference === "auto" ? defaultPath : preference) ?? ""));
  if (!selected) throw new Error("The selected terminal is unavailable. Choose another terminal in Settings.");
  return selected;
}
