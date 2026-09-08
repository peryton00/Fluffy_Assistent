/**
 * Fluffy Desktop - Telemetry Metric Card Component
 * 
 * Compact industrial metric panel showing value, progress bar,
 * status badge, and click-to-inspect interaction.
 */

import React from "react";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import type { InspectorSelection } from "../../../types/ui";

interface TelemetryMetricCardProps {
  id: string;
  type: "cpu" | "ram" | "disk" | "network" | "battery";
  title: string;
  icon: React.ReactNode;
  primaryValue: string;
  secondaryValue?: string;
  percent?: number;
  statusText?: string;
  statusSeverity?: "normal" | "warning" | "danger" | "muted";
  inspectData: Record<string, unknown>;
}

export const TelemetryMetricCard: React.FC<TelemetryMetricCardProps> = ({
  id,
  type,
  title,
  icon,
  primaryValue,
  secondaryValue,
  percent,
  statusText,
  statusSeverity = "normal",
  inspectData,
}) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const isSelected = selectedItem?.id === id && selectedItem?.type === type;

  const handleSelect = () => {
    const selection: InspectorSelection = {
      id,
      type,
      title: `${title} Telemetry`,
      data: inspectData,
    };
    uiStore.setSelectedItem(selection, true);
  };

  const getSeverityColor = () => {
    switch (statusSeverity) {
      case "danger":
        return "var(--color-danger)";
      case "warning":
        return "var(--color-warning)";
      case "muted":
        return "var(--color-text-muted)";
      case "normal":
      default:
        return percent !== undefined && percent > 85
          ? "var(--color-danger)"
          : percent !== undefined && percent > 70
          ? "var(--color-warning)"
          : "var(--color-accent)";
    }
  };

  const barColor = getSeverityColor();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-label={`Inspect ${title}`}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
        border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        cursor: "pointer",
        transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
        minWidth: "180px",
        flex: "1 1 180px",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--color-border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--color-border)";
        }
      }}
    >
      {/* Title & Icon Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-secondary)" }}>
          <span style={{ display: "flex", color: "var(--color-accent)" }}>{icon}</span>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {title}
          </span>
        </div>
        {statusText && (
          <span
            style={{
              fontSize: "10px",
              fontWeight: "var(--font-weight-medium)",
              color: barColor,
              backgroundColor: "var(--color-surface-elevated)",
              padding: "1px 5px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {statusText}
          </span>
        )}
      </div>

      {/* Primary Value */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
          {primaryValue}
        </span>
        {secondaryValue && (
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            {secondaryValue}
          </span>
        )}
      </div>

      {/* Progress Bar (if percent available) */}
      {percent !== undefined && (
        <div
          style={{
            height: "4px",
            width: "100%",
            backgroundColor: "var(--color-surface-elevated)",
            borderRadius: "2px",
            overflow: "hidden",
            marginTop: "2px",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, percent))}%`,
              backgroundColor: barColor,
              borderRadius: "2px",
              transition: "width var(--transition-normal)",
            }}
          />
        </div>
      )}
    </div>
  );
};
