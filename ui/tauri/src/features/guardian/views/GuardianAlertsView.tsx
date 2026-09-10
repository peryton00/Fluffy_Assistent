/**
 * Fluffy Desktop - Guardian Alerts View
 *
 * Security alerts feed with severity filtering, search, detailed inspector binding,
 * and direct security remediation actions (trust, ignore, mark dangerous).
 */

import React, { useState } from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useGuardianStore } from "../../../stores/guardianStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  XCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  SearchIcon,
  CheckCircleIcon,
} from "../../../components/common/Icons";
import type { SecurityAlert, SecurityActionType, AlertSeverity } from "../../../types/contracts";

const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "info"] as const;

const getSeverityColors = (severity?: string) => {
  const s = severity?.toLowerCase() || "info";
  switch (s) {
    case "critical": return { badge: { color: "var(--color-danger)", bg: "color-mix(in srgb, var(--color-danger) 15%, transparent)", border: "color-mix(in srgb, var(--color-danger) 30%, transparent)" } };
    case "high": return { badge: { color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 15%, transparent)", border: "color-mix(in srgb, var(--color-warning) 30%, transparent)" } };
    case "medium":
    case "warning": return { badge: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" } };
    default: return { badge: { color: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 15%, transparent)", border: "color-mix(in srgb, var(--color-accent) 30%, transparent)" } };
  }
};

const getSeverityIcon = (severity?: string) => {
  const s = severity?.toLowerCase() || "info";
  switch (s) {
    case "critical": return <XCircleIcon size={16} />;
    case "high":
    case "medium":
    case "warning": return <AlertTriangleIcon size={16} />;
    default: return <InfoIcon size={16} />;
  }
};

export const GuardianAlertsView: React.FC = () => {
  const telemetry = useTelemetryStore();
  const guardian = useGuardianStore();
  const { setInspectorItem } = useUIStore();

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const snapshot = telemetry.snapshot;
  const rawSecurityAlerts: SecurityAlert[] = snapshot?.security_alerts || [];
  const rawVerdicts = snapshot?._guardian_verdicts;
  const isLearning = Boolean(snapshot?._guardian_state?.is_learning);
  const remainingSecs = snapshot?._guardian_state?.learning_seconds_remaining ?? 0;
  const progressPct = snapshot?._guardian_state?.learning_progress ?? 0;

  const verdictItems: Array<Record<string, unknown>> = Array.isArray(rawVerdicts)
    ? (rawVerdicts as Array<Record<string, unknown>>)
    : typeof rawVerdicts === "object" && rawVerdicts !== null
    ? (Object.values(rawVerdicts) as Array<Record<string, unknown>>)
    : [];

  // Normalize and combine security alerts and Guardian verdicts
  const combinedAlerts: SecurityAlert[] = [
    ...rawSecurityAlerts.map((a, idx): SecurityAlert => ({
      ...a,
      id: a.id || `alert-${a.pid || idx}-${a.timestamp || Date.now()}`,
      process_name: String(a.process_name || a.name || (a.pid ? `PID ${a.pid}` : "Unknown Process")),
      severity: ((a.severity || "info").toLowerCase() as AlertSeverity),
      message: String(a.message || a.reason || "Suspicious runtime behavior detected"),
    })),
    ...verdictItems
      .filter((v) => {
        const pid = Number(v.pid);
        return !rawSecurityAlerts.some((a) => a.pid === pid);
      })
      .map((v, idx): SecurityAlert => {
        const pid = Number(v.pid || 0);
        const score = Number(v.score ?? v.risk_score ?? v.anomaly_score ?? 0);
        const lvl = String(v.level || "").toLowerCase();
        const sevStr = String(v.severity || v.type || "").toLowerCase();

        let severity: AlertSeverity = "low";
        if (sevStr === "critical" || lvl.includes("critical") || lvl.includes("termination") || score >= 75) {
          severity = "critical";
        } else if (sevStr === "high" || lvl.includes("high") || lvl.includes("confirmation") || score >= 50) {
          severity = "high";
        } else if (sevStr === "medium" || sevStr === "warning" || lvl.includes("moderate") || lvl.includes("warn") || score >= 25) {
          severity = "medium";
        }

        return {
          id: String(v.id || `verdict-${pid}-${idx}`),
          timestamp: (v.timestamp as number) || Date.now(),
          severity,
          alert_type: "Guardian Behavioral Verdict",
          message: String(v.message || v.reason || v.explanation || `Behavioral deviation detected in ${v.process_name || v.process || pid}`),
          process_name: String(v.process_name || v.process || v.name || `PID ${pid}`),
          pid,
          score,
          reason: String(v.reason || ""),
          details: {
            explanation: v.explanation,
            confidence: v.confidence,
            level: v.level,
            anomalies: v.anomalies,
          },
        };
      }),
  ];

  const filteredAlerts = combinedAlerts.filter((alert) => {
    const sev = alert.severity?.toLowerCase() || "info";
    if (severityFilter !== "all" && sev !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        alert.process_name?.toLowerCase().includes(q) ||
        alert.reason?.toLowerCase().includes(q) ||
        String(alert.pid || "").includes(q) ||
        alert.message?.toLowerCase().includes(q) ||
        alert.alert_type?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAction = async (
    e: React.MouseEvent,
    pid: number,
    action: SecurityActionType,
    processName?: string
  ) => {
    e.stopPropagation();
    await guardian.handleSecurityAction(pid, action, processName);
  };

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  const card: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Controls Bar */}
      <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Filter alerts by process, PID, reason, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: "32px",
              paddingRight: "12px",
              paddingTop: "7px",
              paddingBottom: "7px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Severity Filter Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "4px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          {SEVERITY_FILTERS.map((sev) => {
            const isActive = severityFilter === sev;
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  textTransform: "capitalize",
                  border: "none",
                  backgroundColor: isActive ? "var(--color-accent)" : "transparent",
                  color: isActive ? "#fff" : "var(--color-text-muted)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                {sev}
              </button>
            );
          })}
        </div>
      </div>

      {/* Count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
        <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
          Showing {filteredAlerts.length} of {combinedAlerts.length} active alerts
        </span>
      </div>

      {/* Alerts Feed */}
      {filteredAlerts.length === 0 ? (
        <div
          style={{
            ...card,
            padding: "var(--space-6)",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
          }}
        >
          {isLearning && !searchQuery && severityFilter === "all" ? (
            <>
              <span style={{ color: "var(--color-accent)", display: "flex" }}>
                <ShieldCheckIcon size={36} />
              </span>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                Learning & Baseline Profiling Active ({formatTimer(remainingSecs)} left)
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, textAlign: "center", maxWidth: "480px" }}>
                Guardian is currently observing system activity to establish behavioral baselines ({progressPct}% complete). Anomaly alerts will be generated if processes deviate from the calibrated baseline.
              </p>
            </>
          ) : (
            <>
              <span style={{ color: "var(--color-success)", display: "flex" }}>
                <CheckCircleIcon size={36} />
              </span>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                No Security Alerts Found
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, textAlign: "center" }}>
                {searchQuery || severityFilter !== "all"
                  ? "No alerts match the active filter criteria."
                  : "Guardian has detected no active threats or anomalous process activities across your running software."}
              </p>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filteredAlerts.map((alert, idx) => {
            const inFlight = alert.pid ? guardian.inFlightSecurityActions[alert.pid] : undefined;
            const colors = getSeverityColors(alert.severity);
            return (
              <div
                key={alert.id || `alert-${idx}`}
                onClick={() =>
                  setInspectorItem({
                    id: alert.id || `alert-${idx}`,
                    type: "guardianAlert",
                    title: `Threat: ${alert.process_name || "Security Alert"}`,
                    data: alert,
                  })
                }
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-4)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  transition: "border-color var(--transition-fast)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", flex: "1 1 200px" }}>
                  <span style={{ color: colors.badge.color, display: "flex", flexShrink: 0, marginTop: "2px" }}>
                    {getSeverityIcon(alert.severity)}
                  </span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                        {alert.process_name || "Unknown Process"}
                      </span>
                      {alert.pid && (
                        <span
                          style={{
                            fontSize: "var(--font-size-xs)",
                            fontFamily: "var(--font-mono)",
                            padding: "1px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: "var(--color-surface-elevated)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          PID: {alert.pid}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "var(--font-weight-bold)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: colors.badge.bg,
                          color: colors.badge.color,
                          border: `1px solid ${colors.badge.border}`,
                        }}
                      >
                        {alert.severity || "info"}
                      </span>
                    </div>
                    <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
                      {alert.message || alert.reason || "Suspicious runtime behavior detected"}
                    </p>
                    {alert.reason && alert.message && alert.reason !== alert.message && (
                      <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                        Details: {alert.reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Remediation Buttons */}
                {alert.pid && (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0, alignSelf: "center" }}>
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => handleAction(e, alert.pid!, "trust", alert.process_name)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-success)",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <ShieldCheckIcon size={12} />
                      {inFlight === "trust" ? "Trusting..." : "Trust"}
                    </button>
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => handleAction(e, alert.pid!, "ignore", alert.process_name)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        fontSize: "var(--font-size-xs)",
                        backgroundColor: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-text-secondary)",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      {inFlight === "ignore" ? "Ignoring..." : "Ignore"}
                    </button>
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => handleAction(e, alert.pid!, "mark_dangerous", alert.process_name)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "color-mix(in srgb, var(--color-danger) 15%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-danger)",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <ShieldAlertIcon size={12} />
                      {inFlight === "mark_dangerous" ? "Marking..." : "Dangerous"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
