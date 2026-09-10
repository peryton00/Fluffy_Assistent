/**
 * Fluffy Desktop - Guardian Status Card Component
 * 
 * Displays core policy enforcement state, anomaly monitoring metrics,
 * and baseline learning phase controls.
 */

import React, { useState } from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useGuardianStore, guardianStore } from "../../../stores/guardianStore";
import { LockIcon, TrashIcon } from "../../../components/common/Icons";

export const GuardianStatusCard: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const isOnline = useTelemetryStore((s) => s.connectionState === "CONNECTED");
  const guardian = useGuardianStore();
  const trustedProcesses = guardian.trustedProcesses;
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const rawVerdicts = snapshot?._guardian_verdicts || {};
  const verdictCount = Array.isArray(rawVerdicts) ? rawVerdicts.length : Object.keys(rawVerdicts).length;
  const pendingApprovals = snapshot?.pending_confirmations || [];

  const handleClearBaselines = async () => {
    if (!window.confirm("Clear all Guardian learned behavioral baselines and re-enter learning mode?")) {
      return;
    }
    setIsResetting(true);
    setResetMessage(null);
    try {
      await guardianStore.clearBaselines();
      setResetMessage("Baselines cleared. Re-entered learning phase.");
    } catch (err: unknown) {
      setResetMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: "var(--color-accent)" }}><LockIcon size={16} /></span>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>
            Policy &amp; Protection Engine
          </span>
        </div>
        <button
          type="button"
          onClick={handleClearBaselines}
          disabled={isResetting || !isOnline}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            fontSize: "10px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text-muted)",
            cursor: isResetting ? "wait" : "pointer",
          }}
          title="Reset Guardian Behavioral Baselines"
        >
          <TrashIcon size={11} />
          <span>{isResetting ? "Resetting..." : "Reset Baselines"}</span>
        </button>
      </div>

      {resetMessage && (
        <div
          style={{
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: resetMessage.startsWith("Error") ? "var(--color-danger-subtle)" : "var(--color-surface-elevated)",
            border: `1px solid ${resetMessage.startsWith("Error") ? "var(--color-danger-border)" : "var(--color-accent)"}`,
            color: resetMessage.startsWith("Error") ? "var(--color-danger)" : "var(--color-text)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {resetMessage}
        </div>
      )}

      {/* Learning Phase Calibration Progress & Countdown Timer */}
      {snapshot?._guardian_state?.is_learning ? (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "color-mix(in srgb, var(--color-warning) 8%, var(--color-surface-elevated))",
            border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
            borderRadius: "var(--radius-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-warning)",
                  display: "inline-block",
                  boxShadow: "0 0 8px var(--color-warning)",
                }}
              />
              <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", color: "var(--color-warning)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                5-Minute Calibration Phase Active
              </span>
            </div>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: "var(--font-weight-bold)", color: "var(--color-warning)" }}>
              {Math.floor((snapshot._guardian_state.learning_seconds_remaining ?? 300) / 60)}m{" "}
              {String((snapshot._guardian_state.learning_seconds_remaining ?? 300) % 60).padStart(2, "0")}s left
              {" "}
              <span style={{ fontSize: "10px", fontWeight: "normal", color: "var(--color-text-muted)" }}>
                ({snapshot._guardian_state.learning_progress ?? 0}% completed)
              </span>
            </div>
          </div>

          <div
            style={{
              width: "100%",
              height: "4px",
              backgroundColor: "var(--color-surface)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, snapshot._guardian_state.learning_progress ?? 0))}%`,
                height: "100%",
                backgroundColor: "var(--color-warning)",
                transition: "width var(--transition-fast)",
              }}
            />
          </div>

          <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
            Guardian is mapping normal behavioral baselines for your applications. Proactive intervention alerts are silenced until initial learning completes.
          </span>
        </div>
      ) : null}

      {/* Grid of Key Protection Vectors */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Policy Engine</div>
          <div style={{ fontSize: "13px", fontWeight: "var(--font-weight-bold)", color: "var(--color-success)", marginTop: "2px" }}>
            ENFORCED
          </div>
        </div>

        <div style={{ padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Trusted Processes</div>
          <div style={{ fontSize: "13px", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
            {trustedProcesses.length} whitelisted
          </div>
        </div>

        <div style={{ padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Active Anomalies</div>
          <div style={{ fontSize: "13px", fontWeight: "var(--font-weight-bold)", color: verdictCount > 0 ? "var(--color-warning)" : "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
            {verdictCount} detected
          </div>
        </div>

        <div style={{ padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Pending Authorization</div>
          <div style={{ fontSize: "13px", fontWeight: "var(--font-weight-bold)", color: pendingApprovals.length > 0 ? "var(--color-warning)" : "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
            {pendingApprovals.length} action{pendingApprovals.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </div>
  );
};
