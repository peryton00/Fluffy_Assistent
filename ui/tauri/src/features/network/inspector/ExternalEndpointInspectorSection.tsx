/**
 * Fluffy Desktop - External Endpoint Inspector Section (Phase N11)
 * 
 * Displays derived presentation information for an external IP endpoint.
 * Invariant: Explicitly labeled as External Endpoint; never stored as a fake Node or Device in backend.
 * Zero Emojis, Read-Only Projection.
 */

import React from "react";
import type { ResolvedExternalEndpoint } from "./inspectorModel";
import type { NetworkEvent } from "../../../types/contracts";
import { uiStore } from "../../../stores/uiStore";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import {
  Share2Icon,
  ActivityIcon,
  ExternalLinkIcon,
} from "../../../components/common/Icons";

interface ExternalEndpointInspectorSectionProps {
  endpoint: ResolvedExternalEndpoint;
  relatedEvents: NetworkEvent[];
}

export const ExternalEndpointInspectorSection: React.FC<ExternalEndpointInspectorSectionProps> = ({
  endpoint,
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

      {/* 2. Endpoint Identity & Classification */}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
            External Endpoint
          </h4>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "rgba(147, 51, 234, 0.15)",
              color: "var(--color-accent-purple, #a855f7)",
              fontSize: "10px",
              fontWeight: "bold",
              textTransform: "uppercase",
            }}
          >
            WAN Target
          </span>
        </div>
        <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
          Derived presentation target resolved from active socket flows. (Unauthenticated external entity; not stored as a cluster node or subnet device).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px", marginTop: "var(--space-1)" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Endpoint ID:</span>
          <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{endpoint.id}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Remote IP:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--font-weight-semibold)" }}>{endpoint.remoteAddress}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Protocols:</span>
          <span>{endpoint.protocols.join(", ") || "None"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Target Ports:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {endpoint.ports.length > 0 ? endpoint.ports.join(", ") : "Various"}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>First Seen:</span>
          <span>
            {endpoint.firstSeenEpoch
              ? new Date(endpoint.firstSeenEpoch * 1000).toLocaleTimeString()
              : "Active session"}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Last Active:</span>
          <span>
            {endpoint.lastActiveEpoch
              ? new Date(endpoint.lastActiveEpoch * 1000).toLocaleTimeString()
              : "Active"}
          </span>
        </div>
      </div>

      {/* 3. Associated Active Flows */}
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
          Associated Flows ({endpoint.associatedConnections.length})
        </h4>
        {endpoint.associatedConnections.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {endpoint.associatedConnections.map((c) => (
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
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No active flows to this endpoint</span>
        )}
      </div>

      {/* 4. Recent Related Events */}
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
