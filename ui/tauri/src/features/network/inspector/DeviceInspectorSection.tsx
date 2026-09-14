/**
 * Fluffy Desktop - Device Inspector Section (Phase N11)
 * 
 * Displays authoritative properties and discovery state for a selected NetworkDevice.
 * Unauthenticated LAN neighbor; not a cluster node.
 * Zero Emojis, Read-Only Projection.
 */

import React from "react";
import type { NetworkDevice, NetworkConnection, NetworkEvent } from "../../../types/contracts";
import { uiStore } from "../../../stores/uiStore";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import {
  WifiIcon,
  Share2Icon,
  ExternalLinkIcon,
} from "../../../components/common/Icons";

interface DeviceInspectorSectionProps {
  device: NetworkDevice;
  associatedConnections: NetworkConnection[];
  relatedEvents: NetworkEvent[];
}

export const DeviceInspectorSection: React.FC<DeviceInspectorSectionProps> = ({
  device,
  associatedConnections,
  relatedEvents,
}) => {
  const navTo = (view: string) => {
    uiStore.setActiveSidebarView(view);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* 1. Quick Navigation Actions */}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => navTo("topology")}
          style={{
            flex: 1,
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
          <Share2Icon size={12} />
          <span>View in Topology</span>
        </button>
        <button
          type="button"
          onClick={() => navTo("systems")}
          style={{
            flex: 1,
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
          <WifiIcon size={12} />
          <span>View in Systems</span>
        </button>
      </div>

      {/* 2. Device Identity */}
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
          Device Identity
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Device ID:</span>
          <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{device.id}</span>

          <span style={{ color: "var(--color-text-muted)" }}>IP Address:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--font-weight-semibold)" }}>{device.ip_address}</span>

          <span style={{ color: "var(--color-text-muted)" }}>MAC Address:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{device.mac_address || "Unavailable"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Hostname:</span>
          <span>{device.hostname || "Unresolved"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Category:</span>
          <span>
            <span style={{ padding: "1px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", fontSize: "11px" }}>
              {device.category}
            </span>
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Vendor:</span>
          <span>{device.vendor || "Unknown"}</span>
        </div>
      </div>

      {/* 3. Discovery State & Classification */}
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
          Discovery & Classification
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>State:</span>
          <div>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor:
                  device.state === "reachable"
                    ? "rgba(34, 197, 94, 0.2)"
                    : "rgba(107, 114, 128, 0.2)",
                color:
                  device.state === "reachable"
                    ? "var(--color-success)"
                    : "var(--color-text-secondary)",
                fontSize: "11px",
                fontWeight: "bold",
              }}
            >
              {device.state.toUpperCase()}
            </span>
          </div>

          <span style={{ color: "var(--color-text-muted)" }}>Source:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{device.source}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Gateway:</span>
          <span>{device.is_gateway ? "Default Gateway" : "No"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Local Host:</span>
          <span>{device.is_self ? "Self (This Machine)" : "Remote Device"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Fluffy Agent:</span>
          <span>{device.is_fluffy_node ? "Yes (Node Available)" : "No"}</span>

          {device.associated_node_id && (
            <>
              <span style={{ color: "var(--color-text-muted)" }}>Linked Node:</span>
              <span
                onClick={() => networkWorkspaceStore.selectEntity("node", device.associated_node_id!)}
                style={{ color: "var(--color-accent)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "11px" }}
              >
                {device.associated_node_id}
              </span>
            </>
          )}

          <span style={{ color: "var(--color-text-muted)" }}>Last Seen:</span>
          <span>
            {device.last_seen_epoch
              ? new Date(device.last_seen_epoch * 1000).toLocaleTimeString()
              : "Never"}
          </span>
        </div>
      </div>

      {/* 4. Associated Connections */}
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
          Associated Flows ({associatedConnections.length})
        </h4>
        {associatedConnections.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {associatedConnections.map((c) => (
              <div
                key={c.id}
                onClick={() => networkWorkspaceStore.selectEntity("connection", c.id)}
                style={{
                  padding: "var(--space-2)",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--font-weight-semibold)" }}>{c.id}</span>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>
                    {c.protocol.toUpperCase()} • {c.local_port} → {c.remote_addr}:{c.remote_port} ({c.state})
                  </div>
                </div>
                <ExternalLinkIcon size={12} style={{ color: "var(--color-text-muted)" }} />
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No active flows matching this IP</span>
        )}
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
