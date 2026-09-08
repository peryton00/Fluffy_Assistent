/**
 * Fluffy Desktop - Systems Header Component
 * 
 * Header bar for Systems domain views showing active host context,
 * connectivity status, sync timestamp, and manual refresh trigger.
 */

import React, { useState } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { useNetworkStore } from "../../../stores/networkStore";
import { RefreshCwIcon, CpuIcon, ServerIcon } from "../../../components/common/Icons";

interface SystemsHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => Promise<void> | void;
}

export const SystemsHeader: React.FC<SystemsHeaderProps> = ({ title, subtitle, onRefresh }) => {
  const lastUpdated = useTelemetryStore((s) => s.lastUpdated);
  const activeMachineId = useNetworkStore((s) => s.activeMachineId);
  const machines = useNetworkStore((s) => s.machines);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeMachine = machines.find((m) => m.machine_id === activeMachineId);
  const isRemoteTarget = Boolean(activeMachineId && activeMachine);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await telemetryCoordinator.refreshNow();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

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
          {isRemoteTarget ? <ServerIcon size={16} /> : <CpuIcon size={16} />}
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
                color: isRemoteTarget ? "var(--color-warning)" : "var(--color-success)",
                backgroundColor: isRemoteTarget ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
                border: `1px solid ${isRemoteTarget ? "rgba(245, 158, 11, 0.25)" : "rgba(16, 185, 129, 0.25)"}`,
                letterSpacing: "0.5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  backgroundColor: isRemoteTarget ? "var(--color-warning)" : "var(--color-success)",
                }}
              />
              {isRemoteTarget ? `REMOTE: ${activeMachine?.name || activeMachineId}` : "LOCAL HOST"}
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
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span>Synced: <code>{formatTime(lastUpdated)}</code></span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh System Data"
            aria-label="Refresh System Data"
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
