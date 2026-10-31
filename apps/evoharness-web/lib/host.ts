/**
 * The host bridge: the only seam between the web app and the shell that
 * embeds it (Electron in a later phase; the upstream project used Tauri).
 *
 * The shell installs the bridge on `window.__evoharnessDesktop` before the
 * first page script runs. In a plain browser nothing installs it, so
 * `isDesktopHost()` stays false and every caller takes its existing web
 * fallback — the same behavior the upstream web build had. The adapters in
 * `lib/desktop-*.ts` keep their exported signatures and translate to this
 * bridge; nothing else in the app may import a shell SDK.
 */

export type DesktopDialogFilter = {
  name: string;
  extensions: string[];
};

export type SelectFilesOptions = {
  multiple?: boolean;
  defaultPath?: string;
  title?: string;
  filters?: DesktopDialogFilter[];
};

export type SelectSavePathOptions = {
  defaultPath?: string;
  title?: string;
  filters?: DesktopDialogFilter[];
};

export type DesktopFileOpenApp = {
  name: string;
  /** Absolute path of the `.app` bundle. */
  path: string;
  isDefault: boolean;
};

/** The wire shape of a native popup menu (mirrors `PopupMenuSpec` in desktop-menu-model). */
export type DesktopPopupMenuItem =
  | { kind: "item"; id: string; text: string; enabled: boolean; checked?: boolean }
  | { kind: "separator" }
  | { kind: "submenu"; text: string; enabled: boolean; items: DesktopPopupMenuItem[] }
  | {
      kind: "predefined";
      item: "Copy" | "Cut" | "Paste" | "SelectAll" | "Undo" | "Redo";
      text?: string;
    };

export type DesktopHost = {
  /** Per-process token for the privileged `/api/desktop/*` routes. */
  getDesktopApiToken(): Promise<string>;
  openExternalUrl(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
  openLogDir(): Promise<void>;
  revealItemInDir(path: string): Promise<void>;
  listAppsForFile(path: string): Promise<DesktopFileOpenApp[]>;
  openPathWith(path: string, appPath: string): Promise<void>;
  selectDirectory(defaultPath?: string): Promise<string | null>;
  selectFiles(options: SelectFilesOptions): Promise<string[]>;
  selectSavePath(options: SelectSavePathOptions): Promise<string | null>;
  setCloseQuits(quit: boolean): Promise<void>;
  quitApp(): Promise<void>;
  relaunch(): Promise<void>;
  showMainWindow(): Promise<void>;
  /** Tells the shell the first real screen is up; the window shows then. */
  appReady(reason: string): Promise<void>;
  /** Mirrors the resolved theme so cold starts survive a port/origin change. */
  setUiTheme(theme: "light" | "dark"): Promise<void>;
  /** Clears the webview's disk caches; resolves to the bytes freed. */
  clearAppCache(): Promise<number>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  startDragging(): Promise<void>;
  closeWindow(): Promise<void>;
  isMaximized(): Promise<boolean>;
  isFocused(): Promise<boolean>;
  /** show + unminimize + focus, for "open on notification" paths. */
  focusWindow(): Promise<void>;
  /** Resolves true when the notification was granted and handed to the OS. */
  notify(title: string, body: string): Promise<boolean>;
  /** Native popup menu; resolves the picked item id, or null when dismissed. */
  showPopupMenu(
    items: DesktopPopupMenuItem[],
    at?: { x: number; y: number },
  ): Promise<string | null>;
  /** Native menu actions (macOS menu bar); returns the unsubscriber. */
  onMenuAction(listener: (action: string) => void): () => void;
  isAutostartEnabled(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;
  writeClipboardText(text: string): Promise<void>;
  /** Raw RGBA clipboard image, or null when the clipboard holds no image. */
  readClipboardImage(): Promise<{ rgba: Uint8Array; width: number; height: number } | null>;
};

declare global {
  interface Window {
    __evoharnessDesktop?: DesktopHost;
  }
}

/** True only when a shell has installed the bridge (always false in a browser). */
export function isDesktopHost(): boolean {
  return typeof window !== "undefined" && window.__evoharnessDesktop != null;
}

/** The bridge, or null in a browser — callers take their web fallback then. */
export function desktopHost(): DesktopHost | null {
  if (typeof window === "undefined") return null;
  return window.__evoharnessDesktop ?? null;
}
