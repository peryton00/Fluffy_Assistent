/**
 * Fluffy Desktop - Shell StatusBar
 * 
 * Persistent bottom operational status line.
 * Consumes telemetryStore exclusively (zero duplicate polling loops).
 */

import React from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../stores/telemetryStore";
import { RefreshCwIcon } from "../../components/common/Icons";
import type { SubsystemHealth } from "../../types/contracts";

export const StatusBar: React.FC = () => {
  const {
    snapshot,
    loading,
    connectionState,
    activityState,
  } = useTelemetryStore();

  const isConnected = connectionState === "CONNECTED";

  // Derive Subsystem Health
  const coreHealth: SubsystemHealth = isConnected ? "healthy" : "unknown";
  const brainHealth: SubsystemHealth = isConnected ? "healthy" : "unknown";
  const guardianHealth: SubsystemHealth = (snapshot?.security_alerts && snapshot.security_alerts.length > 0)
    ? "degraded"
    : isConnected
    ? "healthy"
    : "unknown";
  const memoryHealth: SubsystemHealth = isConnected ? "healthy" : "unknown";

  // Formatted Metrics
  const cpuSource = snapshot?.system?.cpu || snapshot?.cpu;
  const ramSource = snapshot?.system?.ram || snapshot?.ram;
  const netSource = snapshot?.system?.network || snapshot?.networks;

  const cpuPercent = cpuSource?.usage_percent !== undefined
    ? `${cpuSource.usage_percent.toFixed(0)}%`
    : "--";

  const ramPercent = ramSource?.usage_percent !== undefined
    ? `${ramSource.usage_percent.toFixed(0)}%`
    : ramSource?.used_mb !== undefined && ramSource?.total_mb !== undefined
    ? `${Math.round((ramSource.used_mb / ramSource.total_mb) * 100)}%`
    : "--";

  const ramGb = ramSource?.used_mb !== undefined
    ? `${(ramSource.used_mb / 1024).toFixed(1)} GB`
    : "--";

  const netStatus = Array.isArray(netSource)
    ? `${netSource.length} IF`
    : netSource && typeof netSource === "object" && "status" in netSource
    ? String((netSource as { status?: string }).status || "OK")
    : isConnected ? "UP" : "DOWN";

  const getHealthDotColor = (health: SubsystemHealth): string => {
    switch (health) {
      case "healthy": return "var(--color-success)";
      case "degraded": return "var(--color-warning)";
      case "unhealthy": return "var(--color-danger)";
      default: return "var(--color-text-muted)";
    }
  };

  return (
    <footer
      role="status"
      aria-label="Operational System Status"
      style={{
        height: "var(--statusbar-height)",
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-3)",
        fontSize: "var(--font-size-2xs)",
        color: "var(--color-text-muted)",
        zIndex: 50,
        flexShrink: 0,
        fontFamily: "var(--font-family-mono)",
      }}
    >
      {/* Left: Subsystems Status Dots */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {[
          { label: "CORE", health: coreHealth },
          { label: "BRAIN", health: brainHealth },
          { label: "GUARDIAN", health: guardianHealth },
          { label: "MEMORY", health: memoryHealth },
        ].map((subsystem) => (
          <div key={subsystem.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: getHealthDotColor(subsystem.health),
                display: "inline-block",
              }}
            />
            <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-text-secondary)" }}>
              {subsystem.label}
            </span>
          </div>
        ))}
      </div>

      {/* Right: Operational Telemetry & Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span>CPU: <strong style={{ color: "var(--color-text)" }}>{cpuPercent}</strong></span>
          <span>•</span>
          <span>RAM: <strong style={{ color: "var(--color-text)" }}>{ramPercent} ({ramGb})</strong></span>
          <span>•</span>
          <span>NET: <strong style={{ color: "var(--color-text)" }}>{netStatus}</strong></span>
        </div>

        {/* Polling Cadence Badge */}
        <button
          type="button"
          onClick={() => telemetryCoordinator.setActivityState(activityState === "ACTIVE" ? "IDLE" : "ACTIVE")}
          title={`Click to toggle polling cadence. Current: ${activityState} (~${activityState === "ACTIVE" ? "2s" : "10s"})`}
          style={{
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          {activityState === "ACTIVE" ? "2s ACTIVE" : "10s IDLE"}
        </button>

        {/* Refresh Trigger */}
        <button
          type="button"
          onClick={() => telemetryCoordinator.refreshNow()}
          disabled={loading}
          title="Manual Status Refresh (GET /status)"
          aria-label="Refresh telemetry status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: loading ? "var(--color-accent)" : "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <RefreshCwIcon size={11} className={loading ? "spin" : ""} />
        </button>
      </div>
    </footer>
  );
};
