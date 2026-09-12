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
import { AlertTriangleIcon } from "../../../components/common/Icons";
import { GuardianAlertCard } from "../../../components/common/GuardianAlertCard";

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
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
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
        {confirmations.map((conf) => (
          <GuardianAlertCard
            key={conf.command_id}
            conf={conf}
            onAuthorize={handleAuthorize}
            onReject={handleReject}
            isBusy={processingId === conf.command_id}
          />
        ))}
      </div>
    </div>
  );
};
