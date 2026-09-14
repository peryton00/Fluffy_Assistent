/**
 * Fluffy Desktop - Appearance Settings View
 *
 * Configures theme mode (Fluffy Dark, Fluffy Light, High Contrast) and
 * supports importing VS Code workbench theme JSON files.
 * Directly integrates with the authoritative global uiStore.
 */

import React, { useRef, useState } from "react";
import { useUiStore } from "../../../stores/uiStore";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import { SettingToggle } from "../components/SettingToggle";
import type { ImportedTheme } from "../../../themes/vscodeThemeImporter";
import { parseVscodeTheme } from "../../../themes/vscodeThemeImporter";
import { uiStore } from "../../../stores/uiStore";
import {
  SunIcon,
  CheckIcon,
  CloseIcon,
} from "../../../components/common/Icons";

import type { ThemeMode } from "../../../types/ui";
import { THEME_CATALOG } from "../../../themes/themeCatalog";

const THEME_CATEGORIES = [
  "All",
  "Core",
  "Structural & Raw",
  "Tactile & 3D",
  "Modern & Editorial",
  "Futuristic & Retro",
] as const;

type ThemeCategory = typeof THEME_CATEGORIES[number];

// ─── Small inline icons ───────────────────────────────────────────────────────

const UploadIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const TrashIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

// ─── Imported Theme Card ─────────────────────────────────────────────────────

const ImportedThemeCard: React.FC<{
  theme: ImportedTheme;
  isActive: boolean;
  onActivate: () => void;
  onRemove: () => void;
}> = ({ theme, isActive, onActivate, onRemove }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "var(--space-3) var(--space-4)",
      borderRadius: "var(--radius-sm)",
      border: isActive ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
      backgroundColor: isActive ? "var(--color-surface-elevated)" : "var(--color-surface)",
      transition: "all 0.15s ease",
      boxShadow: isActive ? "0 0 0 1px var(--color-accent)" : "none",
    }}
  >
    {/* Swatch */}
    <div
      style={{
        width: "36px",
        height: "36px",
        flexShrink: 0,
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${theme.borderPreview}`,
        backgroundColor: theme.bgPreview,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: "8px", fontFamily: "var(--font-mono)", color: theme.borderPreview, opacity: 0.8 }}>
        Aa
      </span>
    </div>

    {/* Info */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {theme.name}
      </div>
      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "1px" }}>
        {theme.isDark ? "Dark" : "Light"} · {Object.keys(theme.colors).length} mapped tokens
      </div>
    </div>

    {/* Actions */}
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onActivate}
        disabled={isActive}
        title={isActive ? "Active" : "Apply theme"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 8px",
          fontSize: "11px",
          fontWeight: "var(--font-weight-medium)",
          backgroundColor: isActive
            ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
            : "var(--color-surface-elevated)",
          border: "1px solid",
          borderColor: isActive ? "color-mix(in srgb, var(--color-accent) 40%, transparent)" : "var(--color-border)",
          borderRadius: "var(--radius-xs)",
          color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
          cursor: isActive ? "default" : "pointer",
          transition: "all 0.12s ease",
        }}
      >
        {isActive ? <CheckIcon size={11} /> : null}
        {isActive ? "Active" : "Apply"}
      </button>

      <button
        type="button"
        onClick={onRemove}
        title="Remove theme"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          padding: 0,
          backgroundColor: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xs)",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          transition: "all 0.12s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-danger)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-danger)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
        }}
      >
        <TrashIcon size={13} />
      </button>
    </div>
  </div>
);

// ─── Main View ────────────────────────────────────────────────────────────────

export const AppearanceView: React.FC = () => {
  const theme = useUiStore((s) => s.theme);
  const importedThemes = useUiStore((s) => s.importedThemes);
  const activeImportedThemeId = useUiStore((s) => s.activeImportedThemeId);
  const { general } = useSettingsStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory>("All");

  const handleSelectTheme = (selectedTheme: ThemeMode) => {
    settingsStore.updateGeneralSettings({ theme: selectedTheme });
  };

  const displayedThemes = selectedCategory === "All"
    ? THEME_CATALOG
    : THEME_CATALOG.filter((t) => t.category === selectedCategory);

  const handleToggleReducedMotion = (reduced: boolean) => {
    settingsStore.updateGeneralSettings({ reducedMotion: reduced });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseVscodeTheme(text);  // handles JSONC comments
        uiStore.addImportedTheme(parsed);
        uiStore.activateImportedTheme(parsed.id);
        setImportSuccess(`"${parsed.name}" imported and applied.`);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Failed to parse theme file.");
      }
    };
    reader.onerror = () => setImportError("Could not read file.");
    reader.readAsText(file);

    // Reset input so the same file can be re-imported after removal.
    e.target.value = "";
  };

  const dismissFeedback = () => {
    setImportError(null);
    setImportSuccess(null);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SunIcon size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Appearance & Theme
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Visual styles, color palettes, and motion preferences.
            </p>
          </div>
        </div>
      </header>

      {/* Main Settings Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "880px", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

        {/* ── Workbench Themes Grid ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <div>
              <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                Workbench Theme ({THEME_CATALOG.length} Available)
              </h3>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                Select an aesthetic design paradigm for your operator workspace.
              </p>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {THEME_CATEGORIES.map((cat) => {
                const isCatActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: "3px 9px",
                      fontSize: "11px",
                      fontWeight: isCatActive ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: isCatActive
                        ? "color-mix(in srgb, var(--color-accent) 20%, transparent)"
                        : "var(--color-surface-elevated)",
                      border: "1px solid",
                      borderColor: isCatActive ? "var(--color-accent)" : "var(--color-border)",
                      color: isCatActive ? "var(--color-accent)" : "var(--color-text-muted)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
            {displayedThemes.map((t) => {
              const isSelected = theme === t.id;
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTheme(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectTheme(t.id);
                    }
                  }}
                  style={{
                    padding: "var(--space-4)",
                    borderRadius: "var(--radius-sm)",
                    border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                    backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    boxShadow: isSelected ? "0 0 0 1px var(--color-accent)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: t.accentPreview,
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                        {t.name}
                      </span>
                    </div>
                    {isSelected ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "10px",
                          fontWeight: "var(--font-weight-bold)",
                          color: "var(--color-accent)",
                          backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                          padding: "2px 6px",
                          borderRadius: "var(--radius-xs)",
                        }}
                      >
                        <CheckIcon size={10} /> Active
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-muted)",
                          backgroundColor: "var(--color-surface-subtle)",
                          padding: "1px 5px",
                          borderRadius: "var(--radius-xs)",
                        }}
                      >
                        {t.tag}
                      </span>
                    )}
                  </div>

                  {/* Swatch Preview Box */}
                  <div
                    style={{
                      height: "42px",
                      borderRadius: "var(--radius-xs)",
                      border: `1px solid ${t.borderPreview}`,
                      background: t.bgPreview,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 var(--space-3)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        color: t.textPreview,
                        fontWeight: 500,
                      }}
                    >
                      Aa Bb 123
                    </span>
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "2px",
                        backgroundColor: t.accentPreview,
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                      title="Accent color"
                    />
                  </div>

                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0, minHeight: "32px" }}>
                    {t.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── VS Code Theme Import ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              VS Code Themes
            </h3>
            <button
              type="button"
              onClick={() => { dismissFeedback(); fileInputRef.current?.click(); }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "4px 10px",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              <UploadIcon size={13} />
              Import Theme JSON
            </button>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {/* How-to hint */}
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
            Import a VS Code workbench theme <code style={{ fontSize: "10px", backgroundColor: "var(--color-surface-elevated)", padding: "1px 4px", borderRadius: "3px" }}>.json</code> file.
            Find theme JSONs inside a <code style={{ fontSize: "10px", backgroundColor: "var(--color-surface-elevated)", padding: "1px 4px", borderRadius: "3px" }}>.vsix</code> archive
            (rename to <code style={{ fontSize: "10px", backgroundColor: "var(--color-surface-elevated)", padding: "1px 4px", borderRadius: "3px" }}>.zip</code>, open, locate the <code style={{ fontSize: "10px", backgroundColor: "var(--color-surface-elevated)", padding: "1px 4px", borderRadius: "3px" }}>themes/*.json</code> file),
            or download directly from the theme's GitHub repo.
          </p>

          {/* Feedback banner */}
          {importError && (
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-danger-muted)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-danger-text)",
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-2)",
              }}
            >
              <CloseIcon size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span style={{ flex: 1 }}>{importError}</span>
              <button type="button" onClick={dismissFeedback} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
                <CloseIcon size={12} />
              </button>
            </div>
          )}
          {importSuccess && (
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-success-muted)",
                border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-success-text)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <CheckIcon size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{importSuccess}</span>
              <button type="button" onClick={dismissFeedback} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
                <CloseIcon size={12} />
              </button>
            </div>
          )}

          {/* Imported theme list */}
          {importedThemes.length === 0 ? (
            <div
              style={{
                padding: "var(--space-5)",
                borderRadius: "var(--radius-sm)",
                border: "1px dashed var(--color-border)",
                backgroundColor: "var(--color-surface)",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-xs)",
              }}
            >
              No VS Code themes imported yet. Click <strong>Import Theme JSON</strong> to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {importedThemes.map((t) => (
                <ImportedThemeCard
                  key={t.id}
                  theme={t}
                  isActive={activeImportedThemeId === t.id}
                  onActivate={() => uiStore.activateImportedTheme(t.id)}
                  onRemove={() => uiStore.removeImportedTheme(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Accessibility & Motion ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Motion & Accessibility
          </h3>

          <SettingToggle
            label="Reduced Motion Mode"
            description="Disable continuous telemetry animations and decorative transitions across all dashboard widgets."
            checked={general.reducedMotion}
            onChange={handleToggleReducedMotion}
          />
        </div>
      </div>
    </div>
  );
};
