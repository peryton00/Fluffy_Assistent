/**
 * Fluffy Desktop - Network Interfaces View (Phase N8)
 * 
 * Displays host network interface adapters, operational status, IP configurations,
 * and throughput rates from authoritative NetworkState.
 */

import React from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import { DatabaseIcon } from "../../../components/common/Icons";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatRate(bps?: number): string {
  if (!bps || bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${(bps / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const NetworkInterfacesView: React.FC = () => {
  const interfaces = useNetworkWorkspaceStore((s) => s.interfaces);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <DatabaseIcon size={18} style={{ color: "var(--color-accent)" }} />
            <span>Host Network Adapters ({interfaces.length})</span>
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
            Authoritative physical and virtual network adapters bound on the local host.
          </p>
        </div>
      </div>

      {interfaces.length > 0 ? (
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
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Interface</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Type</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Status</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>MAC Address</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>IPv4 Addresses</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>MTU / Speed</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Traffic RX / TX</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Current Throughput</th>
              </tr>
            </thead>
            <tbody>
              {interfaces.map((i) => {
                const isSelected = selectedEntity.type === "interface" && selectedEntity.id === i.id;
                return (
                  <tr
                    key={i.id}
                    onClick={() => networkWorkspaceStore.selectEntity("interface", i.id)}
                    style={{
                      borderBottom: "1px solid var(--color-border-subtle)",
                      backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{i.name}</div>
                      {i.description && (
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{i.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: "var(--color-surface-elevated)",
                          fontSize: "11px",
                        }}
                      >
                        {i.interface_type}
                      </span>
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: i.is_up ? "rgba(34, 197, 94, 0.2)" : "rgba(107, 114, 128, 0.2)",
                          color: i.is_up ? "var(--color-success)" : "var(--color-text-secondary)",
                          fontSize: "11px",
                          fontWeight: "bold",
                        }}
                      >
                        {i.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                      {i.mac_address || "Unavailable"}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                      {i.ipv4_addresses.join(", ") || "—"}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)" }}>
                      {i.mtu ? `${i.mtu} B` : "—"} / {i.link_speed_mbps ? `${i.link_speed_mbps} Mbps` : "—"}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                      RX: {formatBytes(i.total_received_bytes)}<br />
                      TX: {formatBytes(i.total_transmitted_bytes)}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>
                      RX: {formatRate(i.rates?.rx_bits_per_second ?? (i.rates?.rx_bytes_per_sec ? i.rates.rx_bytes_per_sec * 8 : 0))}<br />
                      TX: {formatRate(i.rates?.tx_bits_per_second ?? (i.rates?.tx_bytes_per_sec ? i.rates.tx_bytes_per_sec * 8 : 0))}
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
            padding: "var(--space-8)",
            backgroundColor: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-sm)",
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          No host network adapters enumerated in authoritative state.
        </div>
      )}
    </div>
  );
};
