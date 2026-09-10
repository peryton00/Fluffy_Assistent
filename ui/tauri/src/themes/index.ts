export * from "./fluffyDark";
export * from "./fluffyLight";
export * from "./highContrast";
export * from "./vscodeThemeImporter";

import { fluffyDarkTheme } from "./fluffyDark";
import { fluffyLightTheme } from "./fluffyLight";
import { highContrastTheme } from "./highContrast";
import type { ThemeMode } from "../types/ui";

export const THEMES = {
  fluffyDark: fluffyDarkTheme,
  fluffyLight: fluffyLightTheme,
  highContrast: highContrastTheme,
} as const;

export function applyTheme(theme: ThemeMode): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", theme);
    // Clear any injected VS Code custom theme when switching back to built-in.
    if (theme !== "custom") clearCustomTheme();
  }
}

import type { ImportedTheme } from "./vscodeThemeImporter";

const CUSTOM_STYLE_ID = "fluffy-custom-theme";

/** Inject imported VS Code theme colors as CSS custom properties on <html>. */
export function applyImportedTheme(theme: ImportedTheme): void {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = CUSTOM_STYLE_ID;
    document.head.appendChild(tag);
  }
  const vars = Object.entries(theme.colors)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  tag.textContent = `:root, [data-theme="custom"] {\n${vars}\n}`;
  document.documentElement.setAttribute("data-theme", "custom");
}

/** Remove injected VS Code theme style, restoring CSS-file fallback. */
export function clearCustomTheme(): void {
  if (typeof document === "undefined") return;
  document.getElementById(CUSTOM_STYLE_ID)?.remove();
}
