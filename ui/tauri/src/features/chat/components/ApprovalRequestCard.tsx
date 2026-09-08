/**
 * Fluffy Desktop - ApprovalRequestCard Component
 * 
 * Renders an authorization warning or interactive prompt when an agent action 
 * or chat-triggered command requires Guardian approval.
 */

import React from "react";
import { ShieldAlertIcon, ArrowRightIcon } from "../../../components/common/Icons";
import { useUiStore } from "../../../stores/uiStore";

interface ApprovalRequestCardProps {
  actionName?: string;
  target?: string;
  reason?: string;
}

export const ApprovalRequestCard: React.FC<ApprovalRequestCardProps> = ({
  actionName = "Privileged System Command",
  target,
  reason,
}) => {
  const selectDomain = useUiStore((state) => state.selectDomain);
  const selectGuardianSection = useUiStore((state) => state.selectGuardianSection);

  const handleNavigateToApprovals = () => {
    selectDomain("guardian");
    selectGuardianSection("approvals");
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-warning)",
        backgroundColor: "var(--color-warning-muted)",
        padding: "var(--space-3)",
        margin: "var(--space-2) 0",
        maxWidth: "100%",
        fontSize: "var(--font-size-xs)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div
          style={{
            padding: "var(--space-2)",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-warning-muted)",
            color: "var(--color-warning-text)",
            marginTop: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldAlertIcon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <h4 style={{ margin: 0, fontWeight: "var(--font-weight-bold)", color: "var(--color-warning-text)" }}>
              Guardian Authorization Required
            </h4>
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-warning-muted)",
                color: "var(--color-warning-text)",
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--color-warning)",
              }}
            >
              Policy Intercept
            </span>
          </div>
          <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-1) 0 0 0", fontSize: "11px", lineHeight: 1.5 }}>
            The requested action <strong style={{ color: "var(--color-text)" }}>{actionName}</strong> {target ? `on "${target}"` : ""} requires explicit operator authorization before execution.
          </p>
          {reason && (
            <p style={{ fontSize: "10px", color: "var(--color-warning-text)", margin: "var(--space-1) 0 0 0", fontFamily: "var(--font-mono)" }}>
              Reason: {reason}
            </p>
          )}

          <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={handleNavigateToApprovals}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-warning)",
                color: "#ffffff",
                fontWeight: "var(--font-weight-bold)",
                fontSize: "var(--font-size-xs)",
                border: "none",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span>Review in Guardian</span>
              <ArrowRightIcon size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
