/**
 * Fluffy Desktop - Appearance Settings View
 * 
 * Configures theme mode (Fluffy Dark, Fluffy Light, High Contrast) and accessibility display options.
 * Directly integrates with the authoritative global uiStore.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import { useUiStore } from "../../../stores/uiStore";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import { SettingToggle } from "../components/SettingToggle";
import type { ThemeMode } from "../../../types/ui";
import {
  SunIcon,
  MoonIcon,
  ShieldIcon,
  CheckIcon,
} from "../../../components/common/Icons";

const THEMES: Array<{
  id: ThemeMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  bgPreview: string;
  borderPreview: string;
}> = [
  {
    id: "fluffyDark",
    name: "Fluffy Dark",
    description: "Industrial dark palette with restrained purple accents. Optimized for low-light operator workstations.",
    icon: <MoonIcon size={16} />,
    bgPreview: "#12141c",
    borderPreview: "#2d3348",
  },
  {
    id: "fluffyLight",
    name: "Fluffy Light",
    description: "Crisp studio light mode with high clarity for bright operational environments.",
    icon: <SunIcon size={16} />,
    bgPreview: "#f8fafc",
    borderPreview: "#cbd5e1",
  },
  {
    id: "highContrast",
    name: "High Contrast",
    description: "Maximum visual separation and stark border contrast for enhanced accessibility.",
    icon: <ShieldIcon size={16} />,
    bgPreview: "#000000",
    borderPreview: "#ffffff",
  },
];

export const AppearanceView: React.FC = () => {
  const theme = useUiStore((s) => s.theme);
  const { general } = useSettingsStore();

  const handleSelectTheme = (selectedTheme: ThemeMode) => {
    settingsStore.updateGeneralSettings({ theme: selectedTheme });
  };

  const handleToggleReducedMotion = (reduced: boolean) => {
    settingsStore.updateGeneralSettings({ reducedMotion: reduced });
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
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "680px", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {/* Theme Mode Selection Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Workbench Theme
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
            {THEMES.map((t) => {
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
                    gap: "var(--space-2)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    boxShadow: isSelected ? "0 0 0 1px var(--color-accent)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)" }}>{t.icon}</span>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                        {t.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-accent)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CheckIcon size={10} />
                      </span>
                    )}
                  </div>

                  {/* Swatch Preview */}
                  <div
                    style={{
                      height: "36px",
                      borderRadius: "var(--radius-xs)",
                      border: `1px solid ${t.borderPreview}`,
                      backgroundColor: t.bgPreview,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "#888888" }}>
                      Aa Bb 123
                    </span>
                  </div>

                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0 }}>
                    {t.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Accessibility & Motion */}
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
