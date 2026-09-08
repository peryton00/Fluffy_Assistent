/**
 * Fluffy Desktop - Pending Confirmations Banner Component
 * 
 * Prominently surfaces high-risk pending actions requiring explicit user authorization.
 * Executes /command { Confirm: ... } or { Cancel: ... } through the operations API service.
 */

import React, { useState } from "react";
import type { PendingConfirmation } from "../../../types/contracts";
import { confirmPendingAction, cancelPendingAction } from "../../../services/api/operations";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { AlertTriangleIcon, CheckIcon, CloseIcon } from "../../../components/common/Icons";

interface PendingConfirmationsBannerProps {
  confirmations: PendingConfirmation[];
}

export const PendingConfirmationsBanner: React.FC<PendingConfirmationsBannerProps> = ({
  confirmations,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!confirmations || confirmations.length === 0) {
    return null;
  }

  const handleAuthorize = async (commandId: string) => {
    setProcessingId(commandId);
    setActionError(null);
    try {
      await confirmPendingAction(commandId);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      setActionError(`Failed to authorize: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (commandId: string) => {
    setProcessingId(commandId);
    setActionError(null);
    try {
      await cancelPendingAction(commandId);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      setActionError(`Failed to reject: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        backgroundColor: "rgba(245, 158, 11, 0.08)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-warning)" }}>
          <AlertTriangleIcon size={16} />
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
            Action Requires Approval ({confirmations.length})
          </h2>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-danger)",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
          }}
        >
          RISK: ELEVATED
        </span>
      </div>

      {actionError && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--color-danger)",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            padding: "var(--space-2)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          {actionError}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {confirmations.map((conf) => {
          const isBusy = processingId === conf.command_id;
          const detailsStr = conf.details ? JSON.stringify(conf.details) : null;

          return (
            <div
              key={conf.command_id}
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                padding: "var(--space-3)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <div style={{ minWidth: "220px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                    {conf.command_name || "System Command"}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    ID: {conf.command_id}
                  </span>
                </div>
                {conf.message && (
                  <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: "2px 0 0 0" }}>
                    {conf.message}
                  </p>
                )}
                {detailsStr && detailsStr !== "{}" && (
                  <pre
                    style={{
                      fontSize: "10px",
                      color: "var(--color-text-muted)",
                      margin: "4px 0 0 0",
                      backgroundColor: "var(--color-surface-subtle)",
                      padding: "2px 4px",
                      borderRadius: "2px",
                      maxWidth: "500px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {detailsStr}
                  </pre>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleReject(conf.command_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--color-text-secondary)",
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  <CloseIcon size={12} />
                  <span>Reject</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleAuthorize(conf.command_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 12px",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: "var(--color-danger)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "var(--radius-xs)",
                    color: "#ffffff",
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  <CheckIcon size={12} />
                  <span>{isBusy ? "Authorizing..." : "Authorize"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
