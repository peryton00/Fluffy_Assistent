export * from "./fluffyDark";
export * from "./fluffyLight";
export * from "./highContrast";

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
  }
}
