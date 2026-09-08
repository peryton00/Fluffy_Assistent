/**
 * Fluffy Desktop - Setting Slider Component
 * 
 * Accessible numeric range slider for system tolerances and speeds.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";

interface SettingSliderProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const SettingSlider: React.FC<SettingSliderProps> = ({
  label,
  description,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
  disabled = false,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
            {label}
          </span>
          {description && (
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>
              {description}
            </p>
          )}
        </div>
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-accent)",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "2px 8px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
            whiteSpace: "nowrap",
          }}
        >
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "var(--color-surface-elevated)",
          borderRadius: "999px",
          appearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          accentColor: "var(--color-accent)",
          opacity: disabled ? 0.5 : 1,
          outline: "none",
        }}
      />
    </div>
  );
};
