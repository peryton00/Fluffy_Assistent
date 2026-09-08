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
