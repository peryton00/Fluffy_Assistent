/**
 * Fluffy Desktop - Interface Inspector Section (Phase N11)
 * 
 * Displays authoritative properties for a host NetworkInterfaceInfo.
 * Zero Emojis, Read-Only Projection.
 */

import React from "react";
import type { NetworkInterfaceInfo, NetworkEvent } from "../../../types/contracts";
import { uiStore } from "../../../stores/uiStore";
import {
  LayersIcon,
} from "../../../components/common/Icons";

interface InterfaceInspectorSectionProps {
  iface: NetworkInterfaceInfo;
  relatedEvents: NetworkEvent[];
}

export const InterfaceInspectorSection: React.FC<InterfaceInspectorSectionProps> = ({
  iface,
  relatedEvents,
}) => {
  const navTo = (view: string) => {
    uiStore.setActiveSidebarView(view);
  };

  const isUp = iface.is_up;
  const rxRate = iface.rates?.rx_bytes_per_second ?? iface.rates?.rx_bytes_per_sec ?? 0;
  const txRate = iface.rates?.tx_bytes_per_second ?? iface.rates?.tx_bytes_per_sec ?? 0;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* 1. Quick Navigation Action */}
      <div>
        <button
          type="button"
          onClick={() => navTo("interfaces")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            padding: "5px 8px",
            fontSize: "11px",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            cursor: "pointer",
          }}
        >
          <LayersIcon size={12} />
          <span>View in Interfaces</span>
        </button>
      </div>

      {/* 2. Interface Identity & Status */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Interface Identity
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Name:</span>
          <span style={{ fontWeight: "var(--font-weight-semibold)", fontFamily: "var(--font-mono)" }}>{iface.name}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Type:</span>
          <span style={{ textTransform: "capitalize" }}>{iface.interface_type}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Operational:</span>
          <div>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isUp ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                color: isUp ? "var(--color-success)" : "var(--color-danger)",
                fontSize: "11px",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              {iface.status}
            </span>
          </div>

          <span style={{ color: "var(--color-text-muted)" }}>MAC Address:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{iface.mac_address || "Unavailable"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Classification:</span>
          <span>
            {iface.is_default_gateway ? "Default Gateway" : iface.is_loopback ? "Loopback" : iface.is_physical ? "Physical Adapter" : "Virtual Adapter"}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>MTU:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{iface.mtu ? `${iface.mtu} bytes` : "Unavailable"}</span>
        </div>
      </div>

      {/* 3. IP Addressing & Routing */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          IP Addressing
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "12px" }}>
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "2px" }}>IPv4 Addresses:</div>
            {iface.ipv4_addresses.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {iface.ipv4_addresses.map((ip) => (
                  <span key={ip} style={{ padding: "2px 6px", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {ip}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>None assigned</span>
            )}
          </div>

          {iface.ipv6_addresses.length > 0 && (
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "2px" }}>IPv6 Addresses:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {iface.ipv6_addresses.map((ip) => (
                  <span key={ip} style={{ padding: "2px 6px", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", fontFamily: "var(--font-mono)", fontSize: "10px", wordBreak: "break-all" }}>
                    {ip}
                  </span>
                ))}
              </div>
            </div>
          )}

          {iface.gateway && (
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr" }}>
              <span style={{ color: "var(--color-text-muted)" }}>Gateway:</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{iface.gateway}</span>
            </div>
          )}

          {iface.dns_servers.length > 0 && (
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginBottom: "2px" }}>DNS Servers:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {iface.dns_servers.map((dns) => (
                  <span key={dns} style={{ padding: "2px 6px", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {dns}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Traffic Metrics */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Traffic Rates & Totals
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Total RX:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{formatBytes(iface.total_received_bytes)}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Total TX:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{formatBytes(iface.total_transmitted_bytes)}</span>

          <span style={{ color: "var(--color-text-muted)" }}>RX Rate:</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-success)" }}>
            {formatBytes(rxRate)}/s
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>TX Rate:</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
            {formatBytes(txRate)}/s
          </span>
        </div>
      </div>

      {/* 5. Recent Related Events */}
      {relatedEvents.length > 0 && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
            Recent Events ({relatedEvents.length})
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: "150px", overflowY: "auto" }}>
            {relatedEvents.slice(0, 5).map((e) => (
              <div
                key={e.event_id}
                style={{
                  padding: "4px 6px",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: "10px" }}>
                  <span>{e.event_type}</span>
                  <span>{new Date(e.timestamp_epoch_ms).toLocaleTimeString()}</span>
                </div>
                <div style={{ marginTop: "2px" }}>{e.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
