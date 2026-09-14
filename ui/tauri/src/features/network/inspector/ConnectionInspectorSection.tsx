/**
 * Fluffy Desktop - Connection Inspector Section (Phase N11)
 * 
 * Displays authoritative properties for a selected NetworkConnection.
 * Zero Emojis, Read-Only Projection.
 */

import React from "react";
import type { NetworkConnection, NetworkEvent } from "../../../types/contracts";
import { uiStore } from "../../../stores/uiStore";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import {
  ActivityIcon,
  Share2Icon,
  ExternalLinkIcon,
} from "../../../components/common/Icons";

interface ConnectionInspectorSectionProps {
  connection: NetworkConnection;
  relatedEvents: NetworkEvent[];
}

export const ConnectionInspectorSection: React.FC<ConnectionInspectorSectionProps> = ({
  connection,
  relatedEvents,
}) => {
  const navTo = (view: string) => {
    uiStore.setActiveSidebarView(view);
  };

  const isEstablished = connection.state === "established";

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
          onClick={() => navTo("traffic")}
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
          <ActivityIcon size={12} />
          <span>View in Traffic</span>
        </button>
      </div>

      {/* 2. Connection Identity & Kind */}
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
          Connection Identity
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Connection ID:</span>
          <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{connection.id}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Transport Kind:</span>
          <span>
            <span style={{ padding: "1px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              {connection.kind}
            </span>
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Protocol:</span>
          <span style={{ fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase" }}>{connection.protocol}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Flow State:</span>
          <div>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isEstablished ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                color: isEstablished ? "var(--color-success)" : "var(--color-danger)",
                fontSize: "11px",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              {connection.state}
            </span>
          </div>

          <span style={{ color: "var(--color-text-muted)" }}>Direction:</span>
          <span style={{ textTransform: "capitalize" }}>{connection.direction}</span>
        </div>
      </div>

      {/* 3. Socket Endpoints */}
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
          Socket Endpoints
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Local Endpoint:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {connection.local_addr}:{connection.local_port}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Remote Endpoint:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {connection.remote_addr ? `${connection.remote_addr}:${connection.remote_port ?? "*"}` : "Unspecified"}
          </span>
        </div>
      </div>

      {/* 4. Process & Node Association */}
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
          Attribution & Association
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Process Name:</span>
          <span>{connection.process_name || "Unavailable"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Process PID:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{connection.pid ?? "Unavailable"}</span>

          {connection.associated_node_id && (
            <>
              <span style={{ color: "var(--color-text-muted)" }}>Linked Node:</span>
              <span
                onClick={() => networkWorkspaceStore.selectEntity("node", connection.associated_node_id!)}
                style={{ color: "var(--color-accent)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <span>{connection.associated_node_id}</span>
                <ExternalLinkIcon size={10} />
              </span>
            </>
          )}

          <span style={{ color: "var(--color-text-muted)" }}>Established:</span>
          <span>
            {connection.established_at_epoch
              ? new Date(connection.established_at_epoch * 1000).toLocaleTimeString()
              : "Unknown"}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Last Active:</span>
          <span>
            {connection.last_active_epoch
              ? new Date(connection.last_active_epoch * 1000).toLocaleTimeString()
              : "Unknown"}
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
