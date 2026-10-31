"use client";

import { useEffect } from "react";

import { desktopHost, isDesktopHost } from "@/lib/host";

/**
 * Connect the shell's native menu actions (macOS menu bar) to the web app
 * state. The hook is isolated so browser-only tests and SSR never touch the
 * bridge; in a browser `isDesktopHost()` is false and the effect is a no-op.
 */
export function useNativeAppMenu(onAction: (action: string) => void): void {
  useEffect(() => {
    const host = desktopHost();
    if (!isDesktopHost() || !host) return;
    const dispose = host.onMenuAction(onAction);
    return dispose;
  }, [onAction]);
}
