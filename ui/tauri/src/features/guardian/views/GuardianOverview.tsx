/**
 * Fluffy Desktop - Guardian Overview View
 *
 * Command center displaying Guardian policy status, threat summaries,
 * pending approval alerts, and recent security anomalies.
 */

import React, { useEffect } from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useGuardianStore } from "../../../stores/guardianStore";
import { useUIStore } from "../../../stores/uiStore";
import { GuardianStatusCard } from "../components/GuardianStatusCard";
import { ThreatSummaryCard } from "../components/ThreatSummaryCard";
import { ApprovalQueueCard } from "../components/ApprovalQueueCard";
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
} from "../../../components/common/Icons";

export const GuardianOverview: React.FC = () => {
  const telemetry = useTelemetryStore();
  const guardian = useGuardianStore();
  const { setInspectorItem, selectGuardianSection } = useUIStore();

  useEffect(() => {
    guardian.loadTrustedProcesses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingApprovals = telemetry.snapshot?.pending_confirmations || [];
  const rawVerdicts = telemetry.snapshot?._guardian_verdicts || {};
  const verdicts = Object.entries(rawVerdicts).map(([pidStr, v]) => {
    const verdictObj = v as {
      process_name?: string;
      anomaly_score?: number;
      verdict?: string;
      is_anomaly?: boolean;
    };
    return {
      pid: parseInt(pidStr, 10),
      processName: verdictObj.process_name || `PID ${pidStr}`,
      score: verdictObj.anomaly_score ?? 0,
      verdict: verdictObj.verdict || "normal",
      isAnomaly: verdictObj.is_anomaly || false,
    };
  });

  const handleAuthorize = async (id: string) => { await guardian.authorize(id); };
  const handleReject = async (id: string) => { await guardian.reject(id); };

  const card: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };

  const cardHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "var(--space-3)",
    borderBottom: "1px solid var(--color-border)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Top 2 Cards: Policy Status & Threat Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <GuardianStatusCard />
        <ThreatSummaryCard />
      </div>

      {/* Pending Authorizations Queue */}
      <ApprovalQueueCard
        approvals={pendingApprovals}
        inFlightApprovals={guardian.inFlightApprovals}
        onAuthorize={handleAuthorize}
        onReject={handleReject}
        onSelectApproval={(approval) => {
          const approvalId = (approval as { id?: string; command_id?: string }).id || (approval as { command_id?: string }).command_id || "approval";
          setInspectorItem({
            id: approvalId,
            type: "pendingApproval",
            title: `Approval: ${(approval as { command_id?: string }).command_id || approvalId}`,
            data: approval as unknown as Record<string, unknown>,
          });
        }}
      />

      {/* Grid: Anomaly Diagnostics & Trusted Processes Quick View */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {/* Guardian Anomaly Diagnostics */}
        <div style={card}>
          <div style={cardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-warning)", display: "flex" }}>
                <ShieldAlertIcon size={16} />
              </span>
              <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
                Process Anomaly Diagnostics
              </h3>
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              {verdicts.length} evaluated
            </span>
          </div>

          {verdicts.length === 0 ? (
            <div
              style={{
                padding: "var(--space-6) 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--space-2)",
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <span style={{ color: "var(--color-success)", display: "flex" }}><CheckCircleIcon size={22} /></span>
              <span>No active anomaly verdicts. Processes operating normally.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "256px", overflowY: "auto" }}>
              {verdicts.map((v) => (
                <div
                  key={v.pid}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid",
                    fontSize: "var(--font-size-xs)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: v.isAnomaly
                      ? "color-mix(in srgb, var(--color-danger) 10%, transparent)"
                      : "var(--color-surface-elevated)",
                    borderColor: v.isAnomaly
                      ? "color-mix(in srgb, var(--color-danger) 30%, transparent)"
                      : "var(--color-border-subtle)",
                    color: "var(--color-text)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ color: v.isAnomaly ? "var(--color-danger)" : "var(--color-success)", display: "flex", flexShrink: 0 }}>
                      {v.isAnomaly ? <XCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
                    </span>
                    <div>
                      <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>{v.processName}</span>
                      <span style={{ color: "var(--color-text-muted)", marginLeft: "6px" }}>(PID: {v.pid})</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                      Score:{" "}
                      <strong style={{ color: v.isAnomaly ? "var(--color-danger)" : "var(--color-text)" }}>
                        {(v.score * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: "var(--radius-xs)",
                        fontSize: "10px",
                        fontWeight: "var(--font-weight-bold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        backgroundColor: v.isAnomaly
                          ? "color-mix(in srgb, var(--color-danger) 20%, transparent)"
                          : "var(--color-surface-elevated)",
                        color: v.isAnomaly ? "var(--color-danger)" : "var(--color-text-muted)",
                        border: v.isAnomaly
                          ? "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)"
                          : "1px solid var(--color-border-subtle)",
                      }}
                    >
                      {v.verdict}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compact Whitelist / Trusted Processes */}
        <div style={{ ...card, justifyContent: "space-between" }}>
          <div>
            <div style={cardHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-success)", display: "flex" }}>
                  <ShieldCheckIcon size={16} />
                </span>
                <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
                  Whitelisted Processes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectGuardianSection("trusted")}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-accent)",
                  cursor: "pointer",
                }}
              >
                Manage All ({guardian.trustedProcesses.length}) →
              </button>
            </div>

            {guardian.trustedProcesses.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-6) 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  color: "var(--color-text-muted)",
                  fontSize: "var(--font-size-sm)",
                  marginTop: "var(--space-3)",
                }}
              >
                <InfoIcon size={22} />
                <span>No trusted process whitelists configured.</span>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  maxHeight: "192px",
                  overflowY: "auto",
                  marginTop: "var(--space-3)",
                }}
              >
                {guardian.trustedProcesses.slice(0, 15).map((proc) => (
                  <span
                    key={proc}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-secondary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-success)", flexShrink: 0 }} />
                    {proc}
                  </span>
                ))}
                {guardian.trustedProcesses.length > 15 && (
                  <span style={{ padding: "3px 8px", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                    +{guardian.trustedProcesses.length - 15} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--color-border-subtle)",
              marginTop: "var(--space-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-muted)",
            }}
          >
            <span>Whitelisted items bypass autonomous kill policies.</span>
            <button
              type="button"
              onClick={() => selectGuardianSection("trusted")}
              style={{
                padding: "4px 10px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-xs)",
                cursor: "pointer",
              }}
            >
              Add Whitelist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
