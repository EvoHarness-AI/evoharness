import { getEvoharnessWebSettingsPath, readStored, updateEvoharnessWebSettings } from "./artifact-settings";
import { isFontPreferences, type FontPreferences } from "./font-preferences";

export function readFontPreferences(path = getEvoharnessWebSettingsPath()): FontPreferences | null {
  const fonts = readStored(path).fonts;
  return isFontPreferences(fonts) ? { ui: fonts.ui, mono: fonts.mono } : null;
}

export function writeFontPreferences(fonts: FontPreferences, path = getEvoharnessWebSettingsPath()): void {
  updateEvoharnessWebSettings({ fonts: { ui: fonts.ui, mono: fonts.mono } }, path);
}
