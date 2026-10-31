/**
 * Unified app preference storage. Backed by localStorage in both the web UI
 * and the desktop WebView so prefs survive reloads. Theme is additionally
 * mirrored into the desktop app config dir (see `lib/host.ts` `setUiTheme`)
 * so cold starts keep the choice even if the local server port / origin
 * changes. Key namespace rules live in `lib/app-keys.ts`.
 */

export const APP_PREF_KEYS = {
  theme: "evoharness-theme",
  fonts: "evoharness-fonts",
  locale: "evoharness-locale",
  soundEnabled: "evoharness-sound-enabled",
  quoteSelectionEnabled: "evoharness-quote-selection-enabled",
  sidebarWidth: "evoharness-sidebar-width",
  rightPanelWidth: "evoharness-right-panel-width",
  unreadSessionIds: "evoharness-web:unread-session-ids",
  archivedProjects: "evoharness-web:archived-projects",
  /** Sidebar Projects pane layout: grouped project tree or chronological sessions. */
  projectViewMode: "evoharness-web:project-view-mode",
  /** Project roots whose session list is folded in the sidebar tree. */
  collapsedProjects: "evoharness-web:collapsed-projects",
  /** Project root -> additional five-session pages shown past the preview cap. */
  expandedProjects: "evoharness-web:expanded-projects",
  /** "1" while the sidebar Chats section is folded. */
  collapsedChats: "evoharness-web:collapsed-chats",
  /** Additional five-chat pages shown past the Chats preview cap. */
  chatSessionPages: "evoharness-web:chat-session-pages",
  /** Chat session ids pinned to the top of the Chats section. */
  pinnedChats: "evoharness-web:pinned-chats",
  /** Chat session ids hidden from the Chats section until "Show archived". */
  archivedChats: "evoharness-web:archived-chats",
  closeQuits: "evoharness-desktop-close-quits",
  notifyOnComplete: "evoharness-desktop-notify-on-complete",
  chatDrafts: "evoharness-chat-drafts-v1",
  diffViewMode: "evoharness-diff-view-mode",
  /** Last open session / cwd / file tabs for desktop cold-start restore. */
  workspace: "evoharness-workspace-v1",
} as const;

export type AppPrefKey = (typeof APP_PREF_KEYS)[keyof typeof APP_PREF_KEYS];

export function getPref(key: AppPrefKey): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPref(key: AppPrefKey, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode / quota
  }
}

export function removePref(key: AppPrefKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getPrefBool(key: AppPrefKey, fallback: boolean): boolean {
  const raw = getPref(key);
  if (raw === null) return fallback;
  return raw === "true";
}

export function setPrefBool(key: AppPrefKey, value: boolean): void {
  setPref(key, String(value));
}

export function getPrefJson<T>(key: AppPrefKey): T | null {
  const raw = getPref(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setPrefJson(key: AppPrefKey, value: unknown): void {
  try {
    setPref(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
