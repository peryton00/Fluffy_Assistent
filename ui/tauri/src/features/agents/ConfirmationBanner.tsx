/**
 * Fluffy Desktop - Confirmation Banner Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Surfaced when the backend requires user authorization for security-sensitive steps.
 */

import React from "react";
import { AlertTriangleIcon, CheckCircleIcon, XIcon } from "../../components/common/Icons";
import type { ConfirmationRequest } from "../../types/agent";

interface ConfirmationBannerProps {
  confirmation: ConfirmationRequest;
  loading: boolean;
  onConfirm: () => void;
  onDeny: () => void;
}

export const ConfirmationBanner: React.FC<ConfirmationBannerProps> = ({
  confirmation,
  loading,
  onConfirm,
  onDeny,
}) => {
  const isHighRisk = confirmation.risk_level === "high" || confirmation.risk_level === "critical";

  return (
    <div
      role="alert"
      style={{
        margin: "var(--space-4) var(--space-5) 0 var(--space-5)",
        padding: "var(--space-4) var(--space-5)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: isHighRisk ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
        border: `1px solid ${isHighRisk ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", maxWidth: "700px" }}>
        <div
          style={{
            padding: "8px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: isHighRisk ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
            color: isHighRisk ? "#ef4444" : "#fbbf24",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AlertTriangleIcon size={20} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
              }}
            >
              Security Gate Authorization Required: {confirmation.action}
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: "bold",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isHighRisk ? "#ef4444" : "#fbbf24",
                color: "#111827",
                textTransform: "uppercase",
              }}
            >
              {confirmation.risk_level || "medium"} risk
            </span>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-secondary)",
              margin: "4px 0 0 0",
              lineHeight: 1.4,
            }}
          >
            {confirmation.reason || "The agent is requesting permission to execute an action that modifies system state."}
          </p>

          <div
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              marginTop: "4px",
            }}
          >
            Ref: {confirmation.confirmation_id} {confirmation.step_id ? `(Step: ${confirmation.step_id})` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onDeny}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <XIcon size={14} />
          <span>Deny</span>
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 18px",
            backgroundColor: isHighRisk ? "#dc2626" : "var(--color-accent)",
            border: "none",
            borderRadius: "var(--radius-xs)",
            color: "#ffffff",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-bold)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <CheckCircleIcon size={14} />
          <span>Authorize & Resume</span>
        </button>
      </div>
    </div>
  );
};
