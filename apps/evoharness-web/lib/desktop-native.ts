import { desktopHost, isDesktopHost } from "@/lib/host";
import type { SelectFilesOptions, SelectSavePathOptions } from "@/lib/host";
import { normalizeInstalledFonts, type InstalledFont } from "@/lib/installed-fonts";
import {
  DESKTOP_API_TOKEN_HEADER,
  MAX_DESKTOP_SAVE_BYTES,
} from "@/lib/desktop-api";

export type {
  DesktopDialogFilter,
  SelectFilesOptions,
  SelectSavePathOptions,
} from "@/lib/host";

function asPathArray(selection: string | string[] | null): string[] {
  if (selection == null) return [];
  return Array.isArray(selection) ? selection.filter((path) => typeof path === "string") : [selection];
}

let desktopApiTokenPromise: Promise<string> | null = null;

async function getDesktopApiToken(): Promise<string> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Desktop filesystem authorization is only available in the desktop app.");
  }
  if (!desktopApiTokenPromise) {
    desktopApiTokenPromise = host
      .getDesktopApiToken()
      .then((token) => {
        if (typeof token !== "string" || token.length < 32) {
          throw new Error("Desktop filesystem authorization is unavailable.");
        }
        return token;
      })
      .catch((error) => {
        desktopApiTokenPromise = null;
        throw error;
      });
  }
  return desktopApiTokenPromise;
}

async function desktopApiHeaders(initial?: HeadersInit): Promise<Headers> {
  const headers = new Headers(initial);
  headers.set(DESKTOP_API_TOKEN_HEADER, await getDesktopApiToken());
  return headers;
}

export async function listInstalledFontsNative(): Promise<InstalledFont[]> {
  if (!isDesktopHost()) throw new Error("Installed fonts are only available in the desktop app.");
  const response = await fetch("/api/desktop/fonts", { headers: await desktopApiHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error("Could not read installed fonts");
  const data = await response.json();
  const fonts = normalizeInstalledFonts(data.fonts);
  if (!fonts.length) throw new Error("No installed fonts found");
  return fonts;
}

async function readResponseBytesWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new Error(`File is larger than ${maxBytes / (1024 * 1024)}MB`);
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`File is larger than ${maxBytes / (1024 * 1024)}MB`);
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Native folder-selection dialog (desktop shell only). Resolves null when cancelled. */
export async function selectDirectoryNative(defaultPath?: string): Promise<string | null> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Native directory selection is only available in the desktop app.");
  }
  return host.selectDirectory(defaultPath);
}

/** Native file-selection dialog. Resolves [] when cancelled. */
export async function selectFilesNative(options: SelectFilesOptions = {}): Promise<string[]> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Native file selection is only available in the desktop app.");
  }
  return host.selectFiles(options);
}

/** Native save dialog. Resolves null when cancelled. */
export async function selectSavePathNative(options: SelectSavePathOptions = {}): Promise<string | null> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Native save dialog is only available in the desktop app.");
  }
  return host.selectSavePath(options);
}

/** Open http(s)/mailto URLs in the system handler; fall back to window.open on web. */
export async function openExternal(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  const host = desktopHost();
  if (!host) {
    window.open(trimmed, "_blank", "noopener,noreferrer");
    return;
  }

  await host.openExternalUrl(trimmed);
}

/** Open a local path with the OS default application. */
export async function openPathNative(path: string): Promise<void> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Opening local paths is only available in the desktop app.");
  }
  await host.openPath(path);
}

/** Open the app log folder (desktop.log, server.log) in the file manager. */
export async function openLogDirNative(): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.openLogDir();
}

/** Reveal a local path in Finder / Explorer / file manager. */
export async function revealItemInDirNative(path: string): Promise<void> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Reveal in folder is only available in the desktop app.");
  }
  await host.revealItemInDir(path);
}

/** An application that can open a given file (Finder's "Open With" list). */
export type FileOpenApp = {
  name: string;
  /** Absolute path of the `.app` bundle. */
  path: string;
  isDefault: boolean;
};

/** Applications that can open `path`, default first. Empty where the shell cannot tell (non-macOS). */
export async function listAppsForFileNative(path: string): Promise<FileOpenApp[]> {
  const host = desktopHost();
  if (!host) return [];
  return host.listAppsForFile(path);
}

/** Open a local path with a specific application bundle. */
export async function openPathWithNative(path: string, appPath: string): Promise<void> {
  const host = desktopHost();
  if (!host) {
    throw new Error("Open With is only available in the desktop app.");
  }
  await host.openPathWith(path, appPath);
}

/** Native picker for an application bundle (macOS). Resolves null when cancelled. */
export async function selectApplicationNative(): Promise<string | null> {
  const [path] = await selectFilesNative({
    multiple: false,
    defaultPath: "/Applications",
    title: "Choose Application",
    filters: [{ name: "Applications", extensions: ["app"] }],
  });
  return path ?? null;
}

function triggerBrowserDownload(url: string, fileName?: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Desktop: save-dialog + write bytes from a same-origin URL.
 * Web: trigger a normal browser download.
 * Returns false when the user cancels the save dialog.
 */
export async function downloadUrlAsFile(url: string, defaultFileName: string): Promise<boolean> {
  if (!isDesktopHost()) {
    triggerBrowserDownload(url, defaultFileName);
    return true;
  }

  const destPath = await selectSavePathNative({ defaultPath: defaultFileName });
  if (!destPath) return false;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Download failed (HTTP ${response.status})`);
  }
  const bytes = await readResponseBytesWithinLimit(response, MAX_DESKTOP_SAVE_BYTES);
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const saveResponse = await fetch("/api/desktop/save", {
    method: "POST",
    headers: await desktopApiHeaders({
      "Content-Type": "application/octet-stream",
      "X-Pi-Dest-Path": encodeURIComponent(destPath),
    }),
    body,
  });
  if (!saveResponse.ok) {
    const data = await saveResponse.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Save failed (HTTP ${saveResponse.status})`);
  }
  return true;
}

/**
 * Desktop: save-dialog + server-side copy of an allowed local file.
 * Web: trigger download via the files API.
 */
export async function saveLocalFileAs(
  sourcePath: string,
  defaultFileName: string,
  downloadUrl: string,
): Promise<boolean> {
  if (!isDesktopHost()) {
    triggerBrowserDownload(downloadUrl, defaultFileName);
    return true;
  }

  const destPath = await selectSavePathNative({ defaultPath: defaultFileName });
  if (!destPath) return false;

  const response = await fetch("/api/desktop/save", {
    method: "POST",
    headers: await desktopApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sourcePath, destPath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Save failed (HTTP ${response.status})`);
  }
  return true;
}

export type DesktopImageAttachment = {
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
};

/** Read image files selected via native dialog into chat attachment payloads. */
export async function readDesktopImageAttachments(paths: string[]): Promise<DesktopImageAttachment[]> {
  if (paths.length === 0) return [];
  const response = await fetch("/api/desktop/read-images", {
    method: "POST",
    headers: await desktopApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ paths }),
  });
  const data = await response.json().catch(() => ({})) as {
    error?: string;
    files?: Array<{ name: string; mimeType: string; data: string }>;
  };
  if (!response.ok) {
    throw new Error(data.error || `Failed to read images (HTTP ${response.status})`);
  }
  return (data.files ?? []).map((file) => ({
    ...file,
    previewUrl: `data:${file.mimeType};base64,${file.data}`,
  }));
}

export type DesktopImportResult = {
  uploaded: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
};

/** Copy local source paths into a project directory (desktop native import). */
export async function importLocalFiles(options: {
  destDirectory: string;
  sourcePaths: string[];
  conflict: "error" | "overwrite" | "skip";
  encodeDestPath: (path: string) => string;
}): Promise<{ status: number; data: DesktopImportResult & { error?: string; conflicts?: string[]; nonReplaceable?: string[] } }> {
  const response = await fetch(
    `/api/files/${options.encodeDestPath(options.destDirectory)}?type=import&conflict=${options.conflict}`,
    {
      method: "POST",
      headers: await desktopApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ sourcePaths: options.sourcePaths }),
    },
  );
  const data = await response.json().catch(() => ({})) as DesktopImportResult & {
    error?: string;
    conflicts?: string[];
    nonReplaceable?: string[];
  };
  return { status: response.status, data };
}

/** Intercept primary clicks on external anchors so desktop uses the system browser. */
export function handleExternalLinkClick(
  event: {
    preventDefault(): void;
    defaultPrevented: boolean;
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  },
  url: string | undefined | null,
): void {
  if (!url || !isDesktopHost()) return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void openExternal(url);
}

export async function setCloseQuitsNative(quit: boolean): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.setCloseQuits(quit);
}

/** Whether the OS currently launches EvoHarness at login (false in a browser). */
export async function isAutostartEnabledNative(): Promise<boolean> {
  const host = desktopHost();
  if (!host) return false;
  return host.isAutostartEnabled();
}

/** Add or remove the OS launch-at-login entry; rejects if the OS refuses. */
export async function setAutostartNative(enabled: boolean): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.setAutostart(enabled);
}

export async function quitAppNative(): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.quitApp();
}

/** Clear the webview's disk caches; resolves to the bytes freed (0 in a browser). */
export async function clearAppCacheNative(): Promise<number> {
  const host = desktopHost();
  if (!host) return 0;
  return host.clearAppCache();
}

export async function showMainWindowNative(): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.showMainWindow();
}

let desktopReadyReported = false;

/**
 * Tells the shell the first screen is on the page, which shows the main window
 * (it is built hidden so the user never sees an empty webview). Reports once
 * per page load; the shell shows the window by itself shortly after the page
 * load event even if this never arrives.
 */
export async function reportDesktopReadyNative(source: string): Promise<void> {
  if (desktopReadyReported || !isDesktopHost()) return;
  desktopReadyReported = true;
  try {
    const sincePageStart = Math.round(performance.now());
    await desktopHost()?.appReady(`${source}, page +${sincePageStart}ms`);
  } catch {
    // The shell's own fallback shows the window.
  }
}

/** Relaunch the desktop shell and its packaged local server. */
export async function relaunchAppNative(): Promise<void> {
  const host = desktopHost();
  if (!host) return;
  await host.relaunch();
}

/**
 * Read an image from the system clipboard as a PNG File.
 *
 * WebKitGTK (Linux) delivers an empty `clipboardData.items` list on paste even
 * when the clipboard holds an image (WebKit bug 320303), so the browser-side
 * paste handler cannot recover it. This native fallback uses the Tauri
 * clipboard-manager `readImage()` command, converts the raw RGBA bytes to a
 * PNG via an offscreen canvas, and returns a File the rest of the paste path
 * can consume exactly like a browser-provided image item.
 *
 * Returns null when there is no image in the clipboard or the runtime is not
 * a Tauri desktop shell.
 */
export async function readClipboardImageFileNative(): Promise<File | null> {
  const host = desktopHost();
  if (!host) return null;
  try {
    const image = await host.readClipboardImage();
    if (!image) return null;
    const { rgba, width, height } = image;
    if (!width || !height || rgba.byteLength < width * height * 4) return null;
    // RGBA -> PNG via an offscreen canvas.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14);
    return new File([blob], `clipboard-${stamp}.png`, { type: "image/png" });
  } catch {
    // Clipboard has no image or read failed — not an error worth surfacing.
    return null;
  }
}

export { isDesktopHost };
