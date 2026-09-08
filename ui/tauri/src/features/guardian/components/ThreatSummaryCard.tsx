/**
 * Fluffy Desktop - Threat Summary Card Component
 * 
 * Aggregates live security alerts by severity level (Critical, High, Medium, Info).
 */

import React from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { uiStore } from "../../../stores/uiStore";
import { ShieldAlertIcon, ChevronRightIcon } from "../../../components/common/Icons";

export const ThreatSummaryCard: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const alerts = snapshot?.security_alerts || [];

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const mediumCount = alerts.filter((a) => a.severity === "medium").length;
  const lowCount = alerts.filter((a) => a.severity === "low" || !a.severity).length;

  const handleNavigate = () => {
    uiStore.setActiveSidebarView("alerts");
  };

  return (
    <div
      onClick={handleNavigate}
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        cursor: "pointer",
        transition: "border-color var(--transition-fast)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: alerts.length > 0 ? "var(--color-danger)" : "var(--color-accent)" }}>
            <ShieldAlertIcon size={16} />
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>
            Threat Alerts Distribution
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px", color: "var(--color-accent)" }}>
          <span>View feed</span>
          <ChevronRightIcon size={10} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-2)",
          textAlign: "center",
        }}
      >
        <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--color-danger)", fontWeight: "var(--font-weight-bold)" }}>Critical</div>
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: criticalCount > 0 ? "var(--color-danger)" : "var(--color-text-muted)", marginTop: "2px" }}>
            {criticalCount}
          </div>
        </div>

        <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--color-warning)", fontWeight: "var(--font-weight-bold)" }}>High</div>
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: highCount > 0 ? "var(--color-warning)" : "var(--color-text-muted)", marginTop: "2px" }}>
            {highCount}
          </div>
        </div>

        <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-bold)" }}>Medium</div>
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
            {mediumCount}
          </div>
        </div>

        <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-bold)" }}>Info</div>
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
            {lowCount}
          </div>
        </div>
      </div>
    </div>
  );
};
