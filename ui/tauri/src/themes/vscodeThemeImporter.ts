/**
 * Fluffy Desktop - VS Code Theme Importer
 *
 * Parses VS Code workbench theme JSON files and maps their color keys to
 * Fluffy's semantic CSS custom property names.
 */

/** Minimal shape of a VS Code theme JSON file. */
export interface VscodeThemeJson {
  name?: string;
  type?: "dark" | "light" | "hc";
  colors?: Record<string, string>;
}

/** A parsed, Fluffy-ready imported theme. */
export interface ImportedTheme {
  /** Unique ID (generated at import time). */
  id: string;
  /** Display name (from VS Code theme `name` field). */
  name: string;
  /** Whether this is a dark-variant theme. */
  isDark: boolean;
  /** Fluffy CSS variable name → hex/rgba color value. */
  colors: Record<string, string>;
  /** Background color for preview swatch. */
  bgPreview: string;
  /** Border color for preview swatch. */
  borderPreview: string;
}

/**
 * VS Code workbench color key → Fluffy CSS variable name.
 * Keys listed roughly in priority order within each group.
 * Multiple VS Code keys can map to the same Fluffy var; the first non-empty
 * value found wins.
 */
const COLOR_MAP: Array<[string[], string]> = [
  // Backgrounds
  [["editor.background"],                            "--color-bg"],
  [["sideBar.background", "activityBar.background"], "--color-surface-subtle"],
  [["sideBar.background"],                           "--color-surface"],
  [["tab.activeBackground", "editorGroupHeader.tabsBackground"], "--color-surface-elevated"],
  [["list.hoverBackground"],                         "--color-surface-hover"],
  [["list.activeSelectionBackground"],               "--color-surface-active"],

  // Borders
  [["editorGroupHeader.tabsBorder", "editorGroup.border"], "--color-border-subtle"],
  [["panel.border", "sideBar.border"],               "--color-border"],
  [["contrastBorder", "contrastActiveBorder"],       "--color-border-strong"],
  [["focusBorder"],                                  "--color-border-focus"],

  // Text
  [["editor.foreground"],                            "--color-text"],
  [["foreground"],                                   "--color-text-secondary"],
  [["descriptionForeground"],                        "--color-text-muted"],
  [["disabledForeground"],                           "--color-text-disabled"],

  // Accent / interactive
  [["button.background", "activityBarBadge.background"], "--color-accent"],
  [["button.hoverBackground"],                       "--color-accent-hover"],

  // Semantic
  [["terminal.ansiGreen", "testing.iconPassed"],     "--color-success"],
  [["terminal.ansiYellow", "editorWarning.foreground"], "--color-warning"],
  [["terminal.ansiRed", "errorForeground"],          "--color-danger"],
  [["terminal.ansiCyan", "editorInfo.foreground"],   "--color-info"],
];

/**
 * Strip single-line (//) and block (/* *\/) comments from a JSONC string.
 * VS Code theme files are JSONC, not strict JSON.
 * This regex approach is intentionally simple: it handles the common cases
 * (comments outside strings). Strings containing comment-like sequences are
 * safe because the regex anchors on quote boundaries.
 */
function stripJsonComments(text: string): string {
  // Remove block comments first, then single-line comments.
  // We avoid touching content inside double-quoted strings.
  let result = "";
  let i = 0;
  while (i < text.length) {
    // Inside a string — copy until closing unescaped quote.
    if (text[i] === '"') {
      result += text[i++];
      while (i < text.length) {
        if (text[i] === '\\') { result += text[i++]; result += text[i++]; continue; }
        if (text[i] === '"') { result += text[i++]; break; }
        result += text[i++];
      }
      continue;
    }
    // Block comment
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2; // skip closing */
      result += ' '; // preserve whitespace so line numbers stay roughly intact
      continue;
    }
    // Single-line comment
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    result += text[i++];
  }
  return result;
}

/**
 * Remove trailing commas before } or ] (JSONC allows them, JSON.parse doesn't).
 * Must run AFTER comments are stripped so we don't accidentally hit commas
 * inside comment text.
 */
function stripTrailingCommas(text: string): string {
  // Repeatedly remove commas followed only by whitespace then } or ]
  // until no more remain (handles nested cases in one regex pass).
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/** Full JSONC → JSON: strip comments then trailing commas. */
function jsonCToJson(text: string): string {
  return stripTrailingCommas(stripJsonComments(text));
}

function pickFirst(colors: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = colors[k];
    if (v && v !== "#00000000" && v !== "#ffffff00") return v;
  }
  return undefined;
}

/**
 * Parse a VS Code theme — accepts either a raw JSONC text string (from
 * FileReader) or a pre-parsed object. JSONC comments (// and block comments)
 * are stripped automatically, so themes like JellyFish that use comments work.
 * Throws a descriptive Error if the input is not a valid theme.
 */
export function parseVscodeTheme(raw: unknown): ImportedTheme {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(jsonCToJson(raw));
    } catch {
      throw new Error("Invalid theme file: could not parse JSON. Check for syntax errors.");
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid theme file: expected a JSON object.");
  }
  const json = parsed as VscodeThemeJson;

  if (!json.colors || typeof json.colors !== "object") {
    throw new Error(
      "Invalid theme file: missing top-level \"colors\" object. " +
      "Make sure you are importing the inner theme .json file, not the .vsix package."
    );
  }

  const name = typeof json.name === "string" && json.name.trim()
    ? json.name.trim()
    : "Imported VS Code Theme";

  const isDark = json.type !== "light";

  const colors: Record<string, string> = {};
  for (const [keys, cssVar] of COLOR_MAP) {
    const value = pickFirst(json.colors, keys);
    if (value) colors[cssVar] = value;
  }

  const bgPreview = colors["--color-bg"] ?? (isDark ? "#1e1e1e" : "#ffffff");
  const borderPreview = colors["--color-border"] ?? (isDark ? "#454545" : "#d4d4d4");

  return {
    id: `vsc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    isDark,
    colors,
    bgPreview,
    borderPreview,
  };
}

const STORAGE_KEY = "fluffy_imported_vsc_themes";

export function loadImportedThemes(): ImportedTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ImportedTheme[];
  } catch {
    return [];
  }
}

export function saveImportedThemes(themes: ImportedTheme[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {}
}
