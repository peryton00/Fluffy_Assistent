/**
 * Fluffy Desktop - Threat Summary Card Component
 * 
 * Aggregates live security alerts and Guardian verdicts by severity level (Critical, High, Medium, Info).
 */

import React from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { uiStore } from "../../../stores/uiStore";
import { ShieldAlertIcon, ShieldCheckIcon, ChevronRightIcon } from "../../../components/common/Icons";

export const ThreatSummaryCard: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const rawAlerts = snapshot?.security_alerts || [];
  const rawVerdicts = snapshot?._guardian_verdicts;

  // Normalize verdicts whether received as array or dictionary
  const verdictList: Array<Record<string, unknown>> = Array.isArray(rawVerdicts)
    ? (rawVerdicts as Array<Record<string, unknown>>)
    : typeof rawVerdicts === "object" && rawVerdicts !== null
    ? (Object.values(rawVerdicts) as Array<Record<string, unknown>>)
    : [];

  const categorize = (item: {
    severity?: string;
    level?: string;
    score?: number;
    risk_score?: number;
    anomaly_score?: number;
    type?: string;
  }): "critical" | "high" | "medium" | "low" => {
    const sev = (item.severity || "").toLowerCase();
    const lvl = (item.level || "").toLowerCase();
    const typ = (item.type || "").toLowerCase();
    const sc = Number(item.score ?? item.risk_score ?? item.anomaly_score ?? 0);

    if (sev === "critical" || lvl.includes("critical") || lvl.includes("termination") || sc >= 75) {
      return "critical";
    }
    if (sev === "high" || lvl.includes("high") || lvl.includes("confirmation") || sc >= 50) {
      return "high";
    }
    if (
      sev === "medium" ||
      sev === "warning" ||
      lvl.includes("moderate") ||
      lvl.includes("warn") ||
      lvl.includes("recommend") ||
      typ === "warning" ||
      (sc >= 25 && sc < 50)
    ) {
      return "medium";
    }
    return "low";
  };

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Process raw security alerts
  for (const alert of rawAlerts) {
    const cat = categorize(alert);
    if (cat === "critical") criticalCount++;
    else if (cat === "high") highCount++;
    else if (cat === "medium") mediumCount++;
    else lowCount++;
  }

  // Process Guardian verdicts (avoid double counting same PID)
  const alertedPids = new Set(rawAlerts.map((a) => a.pid).filter(Boolean));
  for (const v of verdictList) {
    const pid = Number(v.pid);
    if (pid && alertedPids.has(pid)) continue;
    const cat = categorize(v as Parameters<typeof categorize>[0]);
    if (cat === "critical") criticalCount++;
    else if (cat === "high") highCount++;
    else if (cat === "medium") mediumCount++;
    else lowCount++;
  }

  const totalThreats = criticalCount + highCount + mediumCount + lowCount;
  const isLearning = Boolean(snapshot?._guardian_state?.is_learning);

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
          <span style={{ color: totalThreats > 0 ? "var(--color-danger)" : "var(--color-accent)" }}>
            {totalThreats > 0 ? <ShieldAlertIcon size={16} /> : <ShieldCheckIcon size={16} />}
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
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: mediumCount > 0 ? "var(--color-accent)" : "var(--color-text-muted)", marginTop: "2px" }}>
            {mediumCount}
          </div>
        </div>

        <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-bold)" }}>Info</div>
          <div style={{ fontSize: "16px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: lowCount > 0 ? "var(--color-text)" : "var(--color-text-muted)", marginTop: "2px" }}>
            {lowCount}
          </div>
        </div>
      </div>

      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "2px" }}>
        <span>
          {totalThreats === 0
            ? isLearning
              ? "Observing process behaviors (Learning phase)"
              : "All processes operating within safety limits"
            : `${totalThreats} total active anomalies recorded`}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: totalThreats > 0 ? "var(--color-warning)" : "var(--color-success)" }}>
          {totalThreats === 0 ? "SECURE" : "ACTIVE"}
        </span>
      </div>
    </div>
  );
};
