/**
 * Fluffy Desktop - Network Overview View (Phase N8)
 * 
 * Provides an operational dashboard of the authoritative Rust Network subsystem:
 * - Connected/available cluster nodes
 * - Discovered subnet devices
 * - Active socket flows and transport connections
 * - Host network interfaces
 * - Current aggregate traffic throughput & top talkers
 * - Monotonic network state revision and synchronization health
 */

import React from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import {
  ActivityIcon,
  CpuIcon,
  DatabaseIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  WifiIcon,
} from "../../../components/common/Icons";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatRate(bps: number): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${(bps / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const NetworkOverview: React.FC = () => {
  const status = useNetworkWorkspaceStore((s) => s.status);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);
  const revision = useNetworkWorkspaceStore((s) => s.revision);
  const lastSynced = useNetworkWorkspaceStore((s) => s.lastSynced);
  const error = useNetworkWorkspaceStore((s) => s.error);
  const nodes = useNetworkWorkspaceStore((s) => s.nodes);
  const devices = useNetworkWorkspaceStore((s) => s.devices);
  const connections = useNetworkWorkspaceStore((s) => s.connections);
  const interfaces = useNetworkWorkspaceStore((s) => s.interfaces);
  const traffic = useNetworkWorkspaceStore((s) => s.traffic);
  const events = useNetworkWorkspaceStore((s) => s.events);

  const availableNodesCount = nodes.filter(
    (n) => n.availability === "available" || n.availability === "connected"
  ).length;
  const activeConnectionsCount = connections.filter((c) => c.state === "established").length;
  const activeInterfacesCount = interfaces.filter((i) => i.is_up).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Synchronization / Health Status Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          backgroundColor: isStale
            ? "rgba(234, 179, 8, 0.1)"
            : status === "error"
            ? "rgba(239, 68, 68, 0.1)"
            : "var(--color-surface)",
          border: `1px solid ${
            isStale
              ? "var(--color-warning)"
              : status === "error"
              ? "var(--color-danger)"
              : "var(--color-border)"
          }`,
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: isStale
                ? "var(--color-warning)"
                : status === "healthy"
                ? "var(--color-success)"
                : status === "loading"
                ? "var(--color-accent)"
                : "var(--color-danger)",
            }}
          />
          <div>
            <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
              {isStale
                ? "Event Stream Degraded (Resynchronizing...)"
                : status === "healthy"
                ? "Authoritative Network State Synced"
                : status === "loading"
                ? "Fetching Authoritative Snapshot..."
                : status === "error"
                ? `Sync Error: ${error?.message ?? "Unknown error"}`
                : "Network Subsystem Ready"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              State Revision: <strong>r{revision}</strong> • Last Updated:{" "}
              {lastSynced ? new Date(lastSynced).toLocaleTimeString() : "Pending"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => networkWorkspaceStore.loadSnapshot()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-1) var(--space-3)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-xs)",
            cursor: "pointer",
          }}
        >
          <RefreshCwIcon size={14} />
          <span>Resync Snapshot</span>
        </button>
      </div>

      {/* Operational KPI Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {/* Cluster Nodes */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
            <span style={{ fontSize: "var(--font-size-xs)" }}>Cluster Nodes</span>
            <CpuIcon size={16} />
          </div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
            {availableNodesCount} <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "normal", color: "var(--color-text-muted)" }}>/ {nodes.length} available</span>
          </div>
        </div>

        {/* Discovered Devices */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
            <span style={{ fontSize: "var(--font-size-xs)" }}>Subnet Devices</span>
            <WifiIcon size={16} />
          </div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
            {devices.length} <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "normal", color: "var(--color-text-muted)" }}>discovered</span>
          </div>
        </div>

        {/* Active Connections */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
            <span style={{ fontSize: "var(--font-size-xs)" }}>Active Flows</span>
            <ActivityIcon size={16} />
          </div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
            {activeConnectionsCount} <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "normal", color: "var(--color-text-muted)" }}>established</span>
          </div>
        </div>

        {/* Host Interfaces */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
            <span style={{ fontSize: "var(--font-size-xs)" }}>Host Adapters</span>
            <DatabaseIcon size={16} />
          </div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
            {activeInterfacesCount} <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "normal", color: "var(--color-text-muted)" }}>/ {interfaces.length} up</span>
          </div>
        </div>

        {/* Live Traffic */}
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
            <span style={{ fontSize: "var(--font-size-xs)" }}>Throughput</span>
            <TrendingUpIcon size={16} />
          </div>
          <div style={{ fontSize: "var(--font-size-md)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
            RX: {formatBytes(traffic?.rx_bytes ?? 0)} • TX: {formatBytes(traffic?.tx_bytes ?? 0)}
          </div>
        </div>
      </div>

      {/* Top Talkers & Recent Activity Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
        {/* Top Talkers Card */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-3)" }}>
            Prominent Traffic Generators (Top Talkers)
          </div>
          {traffic?.top_talkers && traffic.top_talkers.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {traffic.top_talkers.slice(0, 5).map((t, idx) => (
                <div
                  key={t.entity_id || idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-2)",
                    backgroundColor: "var(--color-surface-elevated)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <span style={{ fontWeight: "var(--font-weight-semibold)" }}>{t.entity_name || t.entity_id}</span>
                  <span style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    RX {formatBytes(t.rx_bytes)} ({formatRate(t.rx_rate_bps)}) • TX {formatBytes(t.tx_bytes)} ({formatRate(t.tx_rate_bps)})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-4)" }}>
              No prominent traffic talkers recorded in current cycle.
            </div>
          )}
        </div>

        {/* Live Event Stream Snippet */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-3)" }}>
            Recent Network Events
          </div>
          {events.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {events.slice(0, 5).map((evt) => (
                <div
                  key={evt.event_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-2)",
                    backgroundColor: "var(--color-surface-elevated)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "bold",
                        padding: "2px 6px",
                        borderRadius: "2px",
                        backgroundColor:
                          evt.category === "security"
                            ? "rgba(239, 68, 68, 0.2)"
                            : evt.category === "cluster"
                            ? "rgba(59, 130, 246, 0.2)"
                            : "rgba(107, 114, 128, 0.2)",
                        color:
                          evt.category === "security"
                            ? "var(--color-danger)"
                            : evt.category === "cluster"
                            ? "var(--color-accent)"
                            : "var(--color-text-secondary)",
                      }}
                    >
                      {evt.category.toUpperCase()}
                    </span>
                    <span>{evt.summary}</span>
                  </div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    #{evt.sequence}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-4)" }}>
              No network events received yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
