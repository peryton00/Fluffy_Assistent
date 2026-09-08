/**
 * Fluffy Desktop - Metric Card Component
 * 
 * Displays key analytical summary stats (Min, Max, Avg, Current).
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";

interface MetricCardProps {
  label: string;
  current: number | string;
  min?: number;
  max?: number;
  avg?: number;
  unit?: string;
  colorVar?: string;
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  current,
  min,
  max,
  avg,
  unit = "%",
  colorVar = "var(--color-accent)",
  icon,
}) => {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
            fontWeight: "var(--font-weight-medium)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {icon}
          {label}
        </span>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: colorVar,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
        <span
          style={{
            fontSize: "var(--font-size-xl)",
            fontWeight: "var(--font-weight-bold)",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
          }}
        >
          {typeof current === "number" ? current.toFixed(1) : current}
        </span>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{unit}</span>
      </div>

      {min !== undefined && max !== undefined && avg !== undefined && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "4px",
            paddingTop: "var(--space-2)",
            borderTop: "1px solid var(--color-border-subtle)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
          }}
        >
          <div>
            <span style={{ color: "var(--color-text-muted)", opacity: 0.8 }}>Min:</span> {min.toFixed(1)}
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)", opacity: 0.8 }}>Avg:</span> {avg.toFixed(1)}
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)", opacity: 0.8 }}>Max:</span> {max.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
};
