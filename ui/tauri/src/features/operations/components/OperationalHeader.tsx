/**
 * Fluffy Desktop - Operational Header Component
 * 
 * Displays top operational summary bar, live connection state,
 * update timestamps, and manual sync action.
 */

import React, { useState } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { RefreshCwIcon, ActivityIcon, ShieldIcon, AlertTriangleIcon } from "../../../components/common/Icons";


interface OperationalHeaderProps {
  title: string;
  subtitle?: string;
}

export const OperationalHeader: React.FC<OperationalHeaderProps> = ({ title, subtitle }) => {
  const connectionState = useTelemetryStore((s) => s.connectionState);
  const lastUpdated = useTelemetryStore((s) => s.lastUpdated);
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await telemetryCoordinator.refreshNow();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = () => {
    switch (connectionState) {
      case "CONNECTED":
        return {
          label: "OPERATIONAL",
          color: "var(--color-success)",
          bg: "rgba(16, 185, 129, 0.12)",
          border: "rgba(16, 185, 129, 0.25)",
        };
      case "CONNECTING":
        return {
          label: "CONNECTING",
          color: "var(--color-accent)",
          bg: "rgba(124, 58, 237, 0.12)",
          border: "rgba(124, 58, 237, 0.25)",
        };
      case "STALE":
        return {
          label: "STALE TELEMETRY",
          color: "var(--color-warning)",
          bg: "rgba(245, 158, 11, 0.12)",
          border: "rgba(245, 158, 11, 0.25)",
        };
      case "AUTHENTICATION_FAILED":
        return {
          label: "AUTH REQUIRED",
          color: "var(--color-danger)",
          bg: "rgba(239, 68, 68, 0.12)",
          border: "rgba(239, 68, 68, 0.25)",
        };
      case "BACKEND_UNAVAILABLE":
      default:
        return {
          label: "CORE OFFLINE",
          color: "var(--color-danger)",
          bg: "rgba(239, 68, 68, 0.12)",
          border: "rgba(239, 68, 68, 0.25)",
        };
    }
  };

  const badge = getStatusBadge();
  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const pendingCount = snapshot?.pending_confirmations?.length || 0;
  const alertCount = snapshot?.security_alerts?.length || 0;

  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-accent)",
          }}
        >
          <ActivityIcon size={16} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
              {title}
            </h1>
            <span
              style={{
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                color: badge.color,
                backgroundColor: badge.bg,
                border: `1px solid ${badge.border}`,
                letterSpacing: "0.5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: badge.color,
                }}
              />
              {badge.label}
            </span>
          </div>
          {subtitle && (
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0 0" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {pendingCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-warning)",
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              padding: "4px 8px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
            }}
          >
            <AlertTriangleIcon size={12} />
            <span>{pendingCount} Pending Action{pendingCount > 1 ? "s" : ""}</span>
          </div>
        )}

        {alertCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-danger)",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              padding: "4px 8px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <ShieldIcon size={12} />
            <span>{alertCount} Threat{alertCount > 1 ? "s" : ""}</span>
          </div>
        )}

        <div
          style={{
            fontSize: "11px",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <span>Synced: <code>{formatTime(lastUpdated)}</code></span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh System Status"
            aria-label="Refresh System Status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: isRefreshing ? "var(--color-accent)" : "var(--color-text-secondary)",
              cursor: isRefreshing ? "default" : "pointer",
            }}
          >
            <RefreshCwIcon size={13} style={{ transform: isRefreshing ? "rotate(180deg)" : "none", transition: "transform 0.3s" }} />
          </button>
        </div>
      </div>
    </header>
  );
};
