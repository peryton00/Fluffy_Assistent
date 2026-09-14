/**
 * Fluffy Desktop - Network Traffic View (Phase N8)
 * 
 * Displays live, authoritative traffic telemetry, throughput rates, top talkers,
 * and active socket flow attributions.
 * 
 * Invariants:
 * - Live authoritative telemetry only (no fabricated historical time-series DB).
 * - Attribution hierarchy: Process PID > Local Socket > Discovered Device > Node.
 */

import React from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import { ActivityIcon, TrendingUpIcon } from "../../../components/common/Icons";

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

export const NetworkTrafficView: React.FC = () => {
  const traffic = useNetworkWorkspaceStore((s) => s.traffic);
  const connections = useNetworkWorkspaceStore((s) => s.connections);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* 1. Aggregate Throughput & Counters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <TrendingUpIcon size={18} style={{ color: "var(--color-accent)" }} />
          <span>Aggregate Traffic Throughput</span>
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {/* Total RX */}
          <div style={{ padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Total Received (RX)</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
              {formatBytes(traffic?.rx_bytes ?? 0)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              {traffic?.rx_packets ?? 0} packets • {traffic?.rx_drops ?? 0} drops
            </div>
          </div>

          {/* Total TX */}
          <div style={{ padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Total Transmitted (TX)</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
              {formatBytes(traffic?.tx_bytes ?? 0)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              {traffic?.tx_packets ?? 0} packets • {traffic?.tx_drops ?? 0} drops
            </div>
          </div>

          {/* Current Rate */}
          <div style={{ padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Instantaneous Rates</div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold", marginTop: "var(--space-1)" }}>
              RX: {formatRate(traffic?.rates?.rx_bits_per_second ?? 0)}
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>
              TX: {formatRate(traffic?.rates?.tx_bits_per_second ?? 0)}
            </div>
          </div>

          {/* Errors */}
          <div style={{ padding: "var(--space-3) var(--space-4)", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Packet Errors</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "bold", marginTop: "var(--space-1)", color: (traffic?.rx_errors ?? 0) > 0 ? "var(--color-danger)" : "var(--color-text)" }}>
              {(traffic?.rx_errors ?? 0) + (traffic?.tx_errors ?? 0)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              RX err: {traffic?.rx_errors ?? 0} • TX err: {traffic?.tx_errors ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Talkers Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)" }}>
          Top Talkers (Prominent Traffic Endpoints)
        </h3>

        {traffic?.top_talkers && traffic.top_talkers.length > 0 ? (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-xs)" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Entity / Endpoint</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Entity ID</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Received (RX)</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Transmitted (TX)</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Current Throughput</th>
                </tr>
              </thead>
              <tbody>
                {traffic.top_talkers.map((t, idx) => (
                  <tr key={t.entity_id || idx} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: "var(--font-weight-semibold)" }}>{t.entity_name}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>{t.entity_id}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>{formatBytes(t.rx_bytes)}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>{formatBytes(t.tx_bytes)}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                      RX {formatRate(t.rx_rate_bps)} • TX {formatRate(t.tx_rate_bps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-4)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            No prominent talkers active in current observation window.
          </div>
        )}
      </div>

      {/* 3. Active Socket Flows & Attribution */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <ActivityIcon size={16} style={{ color: "var(--color-accent)" }} />
          <span>Active Socket Flows ({connections.length})</span>
        </h3>

        {connections.length > 0 ? (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-xs)" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Local Endpoint</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Remote Endpoint</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Protocol</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Kind</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>State</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Process (PID)</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Direction</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => {
                  const isSelected = selectedEntity.type === "connection" && selectedEntity.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => networkWorkspaceStore.selectEntity("connection", c.id)}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                        {c.local_addr}:{c.local_port}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                        {c.remote_addr ? `${c.remote_addr}:${c.remote_port}` : "—"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{c.protocol.toUpperCase()}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)" }}>{c.kind}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor:
                              c.state === "established"
                                ? "rgba(34, 197, 94, 0.2)"
                                : "rgba(107, 114, 128, 0.2)",
                            color:
                              c.state === "established"
                                ? "var(--color-success)"
                                : "var(--color-text-secondary)",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                        >
                          {c.state.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        {c.process_name || "Unknown"} {c.pid ? `(${c.pid})` : ""}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-muted)" }}>
                        {c.direction}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-6)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            No active socket connection flows observed.
          </div>
        )}
      </div>
    </div>
  );
};
