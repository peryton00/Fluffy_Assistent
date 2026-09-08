/**
 * Fluffy Desktop - Approval Queue Card Component
 *
 * Authorization management card displaying pending privileged operations
 * requested by AI runtime or automation with explicit Authorize / Reject controls.
 */

import React from "react";
import type { PendingApproval, PendingConfirmation } from "../../../types/contracts";
import {
  ShieldAlertIcon,
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
} from "../../../components/common/Icons";

interface ApprovalQueueCardProps {
  approvals?: (PendingApproval | PendingConfirmation)[];
  item?: PendingConfirmation | PendingApproval;
  inFlightApprovals?: Record<string, "authorizing" | "rejecting">;
  onAuthorize?: (id: string) => Promise<void> | void;
  onReject?: (id: string) => Promise<void> | void;
  onSelectApproval?: (approval: PendingApproval | PendingConfirmation) => void;
}

const getRiskStyle = (risk?: string): React.CSSProperties => {
  const r = risk?.toLowerCase();
  if (r === "high" || r === "critical")
    return { color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)" };
  if (r === "medium")
    return { color: "var(--color-warning)", backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)" };
  return { color: "var(--color-accent)", backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)" };
};

export const ApprovalQueueCard: React.FC<ApprovalQueueCardProps> = ({
  approvals,
  item,
  inFlightApprovals = {},
  onAuthorize,
  onReject,
  onSelectApproval,
}) => {
  const items = approvals || (item ? [item] : []);

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "var(--space-3)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: "var(--color-warning)", display: "flex" }}>
            <ShieldAlertIcon size={16} />
          </span>
          <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
            Pending Authorizations Queue
          </h3>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            padding: "2px 8px",
            borderRadius: "999px",
            backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
            color: "var(--color-warning)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)",
          }}
        >
          {items.length} pending
        </span>
      </div>

      {/* Queue items */}
      {items.length === 0 ? (
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
          <span style={{ color: "var(--color-success)", display: "flex" }}><CheckCircleIcon size={20} /></span>
          <span>Queue is clear. No commands awaiting elevation.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((app) => {
            const appId = (app as PendingApproval).id || (app as PendingConfirmation).command_id;
            const cmdName = (app as PendingApproval).action || (app as PendingConfirmation).command_name;
            const inFlight = inFlightApprovals[appId];
            const risk = (app as PendingApproval).risk;

            return (
              <div
                key={appId}
                onClick={() => onSelectApproval && onSelectApproval(app)}
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  transition: "border-color var(--transition-fast)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                      {cmdName}
                    </span>
                    {risk && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "var(--font-weight-bold)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-xs)",
                          ...getRiskStyle(risk),
                        }}
                      >
                        {risk}
                      </span>
                    )}
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                      ID: {appId}
                    </span>
                  </div>
                  {(app as PendingApproval).reason && (
                    <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
                      {(app as PendingApproval).reason}
                    </p>
                  )}
                  {(app as PendingConfirmation).message && (
                    <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
                      {(app as PendingConfirmation).message}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
                  {onReject && (
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => { e.stopPropagation(); onReject(appId); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-danger)",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <XCircleIcon size={12} />
                      {inFlight === "rejecting" ? "Rejecting..." : "Reject"}
                    </button>
                  )}
                  {onAuthorize && (
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => { e.stopPropagation(); onAuthorize(appId); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        backgroundColor: "var(--color-success)",
                        border: "1px solid var(--color-success)",
                        borderRadius: "var(--radius-xs)",
                        color: "#fff",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <CheckCircleIcon size={12} />
                      {inFlight === "authorizing" ? "Authorizing..." : "Authorize"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer notice */}
      <div
        style={{
          paddingTop: "var(--space-2)",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: "11px",
          color: "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <InfoIcon size={12} />
        Unapproved commands timeout and fail safely.
      </div>
    </div>
  );
};
