import { desktopHost, isDesktopHost } from "@/lib/host";
import { APP_PREF_KEYS, getPrefBool } from "@/lib/app-prefs";

export function desktopNotificationsEnabled(): boolean {
  return getPrefBool(APP_PREF_KEYS.notifyOnComplete, true);
}

/** Show a native notification when the desktop window is in the background. */
export async function notifyDesktop(options: {
  title: string;
  body: string;
}): Promise<void> {
  const host = desktopHost();
  if (!host || !desktopNotificationsEnabled()) return;

  try {
    const focused = await host.isFocused();
    if (focused) return;
  } catch {
    // If focus cannot be determined, still notify.
  }

  try {
    if (!(await host.notify(options.title, options.body))) return;
  } catch (error) {
    console.error("Desktop notification failed:", error);
  }
}

export async function focusDesktopWindow(): Promise<void> {
  if (!isDesktopHost()) return;
  try {
    await desktopHost()?.focusWindow();
  } catch {
    // ignore
  }
}
