import { desktopHost } from "@/lib/host";

export type DesktopPlatform = "macos" | "windows" | "linux" | null;

/** Best-effort OS family for the desktop shell, used to pick window-chrome styling. */
export function getDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return null;
  const platform = navigator.platform || "";
  if (/mac/i.test(platform)) return "macos";
  if (/win/i.test(platform)) return "windows";
  if (/linux/i.test(platform)) return "linux";
  return null;
}

export async function minimizeWindow(): Promise<void> {
  await desktopHost()?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await desktopHost()?.toggleMaximize();
}

export async function startDraggingWindow(): Promise<void> {
  await desktopHost()?.startDragging();
}

export async function closeWindow(): Promise<void> {
  await desktopHost()?.closeWindow();
}

export async function isWindowMaximized(): Promise<boolean> {
  return (await desktopHost()?.isMaximized()) ?? false;
}

export { selectDirectoryNative } from "@/lib/desktop-native";
