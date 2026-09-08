/**
 * Fluffy Desktop - Setting Toggle Component
 * 
 * Accessible toggle control for boolean configuration options.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <label
          style={{
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-text)",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
          onClick={() => !disabled && onChange(!checked)}
        >
          {label}
        </label>
        {description && (
          <p
            style={{
              fontSize: "11px",
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          position: "relative",
          display: "inline-flex",
          height: "20px",
          width: "36px",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          borderRadius: "999px",
          border: "2px solid transparent",
          backgroundColor: checked ? "var(--color-accent)" : "var(--color-surface-elevated)",
          transition: "background-color 0.2s ease-in-out",
          outline: "none",
          opacity: disabled ? 0.5 : 1,
          padding: 0,
        }}
      >
        <span
          style={{
            pointerEvents: "none",
            display: "inline-block",
            height: "16px",
            width: "16px",
            borderRadius: "50%",
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transform: checked ? "translateX(16px)" : "translateX(0)",
            transition: "transform 0.2s ease-in-out",
          }}
        />
      </button>
    </div>
  );
};
