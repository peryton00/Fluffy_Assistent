/**
 * Fluffy Desktop - Notification Popover / Center
 * 
 * Surfaces pending action approvals, security threat alerts, and system notifications
 * in a centralized drawer/popover accessed via the top bar notification icon.
 */

import React, { useState, useEffect, useRef } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../stores/telemetryStore";
import { confirmPendingAction, cancelPendingAction } from "../../services/api/operations";
import {
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  ShieldAlertIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  InfoIcon,
} from "../../components/common/Icons";
import type { AlertSeverity, PendingConfirmation, SecurityAlert, Notification } from "../../types/contracts";

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "approvals" | "alerts">("all");

  const pendingConfirmations: PendingConfirmation[] = snapshot?.pending_confirmations || [];
  const securityAlerts: SecurityAlert[] = snapshot?.security_alerts || [];
  const notifications: Notification[] = snapshot?.notifications || [];

  const totalCount = pendingConfirmations.length + securityAlerts.length + notifications.length;

  // Handle click outside and escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!anchorRef?.current || !anchorRef.current.contains(target))
      ) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

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

  const getSeverityStyle = (severity: AlertSeverity): React.CSSProperties => {
    switch (severity) {
      case "critical":
      case "high":
        return {
          color: "var(--color-danger)",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        };
      case "medium":
        return {
          color: "var(--color-warning)",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
        };
      default:
        return {
          color: "var(--color-accent)",
          backgroundColor: "rgba(99, 102, 241, 0.12)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
        };
    }
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Notifications and Approvals Center"
      style={{
        position: "absolute",
        top: "calc(var(--topbar-height) + 6px)",
        right: "16px",
        width: "440px",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - var(--topbar-height) - 24px)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--color-surface-elevated)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
            Notifications & Approvals
          </span>
          {totalCount > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                backgroundColor: pendingConfirmations.length > 0 ? "var(--color-danger)" : "var(--color-accent)",
                color: "#ffffff",
                padding: "1px 6px",
                borderRadius: "999px",
              }}
            >
              {totalCount}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => telemetryCoordinator.refreshNow()}
            title="Refresh notifications"
            style={{
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              borderRadius: "var(--radius-xs)",
            }}
          >
            <RefreshCwIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close notifications"
            style={{
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              borderRadius: "var(--radius-xs)",
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface-subtle)",
          padding: "0 var(--space-2)",
          gap: "var(--space-1)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          style={{
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: activeTab === "all" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
            color: activeTab === "all" ? "var(--color-accent)" : "var(--color-text-muted)",
            borderBottom: activeTab === "all" ? "2px solid var(--color-accent)" : "2px solid transparent",
            backgroundColor: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          All ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          style={{
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: activeTab === "approvals" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
            color: activeTab === "approvals" ? "var(--color-accent)" : "var(--color-text-muted)",
            borderBottom: activeTab === "approvals" ? "2px solid var(--color-accent)" : "2px solid transparent",
            backgroundColor: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Approvals ({pendingConfirmations.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("alerts")}
          style={{
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: activeTab === "alerts" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
            color: activeTab === "alerts" ? "var(--color-accent)" : "var(--color-text-muted)",
            borderBottom: activeTab === "alerts" ? "2px solid var(--color-accent)" : "2px solid transparent",
            backgroundColor: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Alerts ({securityAlerts.length})
        </button>
      </div>

      {actionError && (
        <div
          style={{
            margin: "var(--space-3) var(--space-4) 0",
            fontSize: "11px",
            color: "var(--color-danger)",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            padding: "var(--space-2)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
          }}
        >
          {actionError}
        </div>
      )}

      {/* Content Area */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          maxHeight: "480px",
        }}
      >
        {totalCount === 0 ? (
          <div
            style={{
              padding: "var(--space-6) var(--space-3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              color: "var(--color-text-muted)",
            }}
          >
            <span style={{ color: "var(--color-success)" }}>
              <CheckCircleIcon size={32} />
            </span>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
              All Clear
            </span>
            <p style={{ fontSize: "11px", margin: 0, textAlign: "center" }}>
              No pending actions, security alerts, or unread notifications.
            </p>
          </div>
        ) : (
          <>
            {/* Pending Approvals Section */}
            {(activeTab === "all" || activeTab === "approvals") && pendingConfirmations.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-warning)" }}>
                  <AlertTriangleIcon size={14} />
                  <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Action Requires Approval ({pendingConfirmations.length})
                  </span>
                </div>

                {pendingConfirmations.map((conf) => {
                  const isBusy = processingId === conf.command_id;
                  const detailsStr = conf.details ? JSON.stringify(conf.details) : null;

                  return (
                    <div
                      key={conf.command_id}
                      style={{
                        backgroundColor: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-xs)",
                        padding: "var(--space-3)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-2)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                          {conf.command_name || "Terminate Suspicious Process"}
                        </span>
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

                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                        ID: {conf.command_id}
                      </div>

                      {conf.message && (
                        <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>
                          {conf.message}
                        </p>
                      )}

                      {detailsStr && detailsStr !== "{}" && (
                        <pre
                          style={{
                            fontSize: "10px",
                            color: "var(--color-text-muted)",
                            margin: 0,
                            backgroundColor: "var(--color-surface-subtle)",
                            padding: "4px 6px",
                            borderRadius: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: "60px",
                          }}
                        >
                          {detailsStr}
                        </pre>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
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
                            backgroundColor: "var(--color-surface)",
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
            )}

            {/* Security Alerts Section */}
            {(activeTab === "all" || activeTab === "alerts") && securityAlerts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-danger)" }}>
                  <ShieldAlertIcon size={14} />
                  <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Security Alerts ({securityAlerts.length})
                  </span>
                </div>

                {securityAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-xs)",
                      padding: "var(--space-3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-2)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                        {alert.alert_type}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "var(--font-weight-bold)",
                          textTransform: "uppercase",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-xs)",
                          ...getSeverityStyle(alert.severity),
                        }}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
                      {alert.message}
                    </p>
                    {alert.reason && (
                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                        Reason: {alert.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* System Notifications Section */}
            {activeTab === "all" && notifications.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-accent)" }}>
                  <InfoIcon size={14} />
                  <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    System Notifications ({notifications.length})
                  </span>
                </div>

                {notifications.map((notif, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-xs)",
                      padding: "var(--space-3)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flex: 1 }}>
                      {notif.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
