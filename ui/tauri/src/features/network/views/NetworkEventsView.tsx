/**
 * Fluffy Desktop - Network Events View (Phase N8)
 * 
 * Displays the live, bounded stream of canonical NetworkEvents from NetworkEventBus.
 * 
 * Invariants:
 * - Real N7 events only (no synthetic UI mock events).
 * - Bounded in-memory window (max 200) to ensure zero memory leaks.
 * - Handles event lag/resynchronization state gracefully.
 */

import React, { useState } from "react";
import { useNetworkWorkspaceStore, networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { ActivityIcon } from "../../../components/common/Icons";
import type { EventCategoryKind, EventSeverityKind } from "../../../types/contracts";

function getCategoryBadgeColor(category: EventCategoryKind): { bg: string; text: string } {
  switch (category) {
    case "security":
      return { bg: "rgba(239, 68, 68, 0.2)", text: "var(--color-danger)" };
    case "cluster":
      return { bg: "rgba(59, 130, 246, 0.2)", text: "var(--color-accent)" };
    case "discovery":
      return { bg: "rgba(168, 85, 247, 0.2)", text: "#a855f7" };
    case "connection":
      return { bg: "rgba(34, 197, 94, 0.2)", text: "var(--color-success)" };
    case "telemetry":
      return { bg: "rgba(234, 179, 8, 0.2)", text: "var(--color-warning)" };
    default:
      return { bg: "rgba(107, 114, 128, 0.2)", text: "var(--color-text-secondary)" };
  }
}

function getSeverityBadgeColor(severity: EventSeverityKind): { bg: string; text: string } {
  switch (severity) {
    case "critical":
    case "error":
      return { bg: "rgba(239, 68, 68, 0.2)", text: "var(--color-danger)" };
    case "warning":
      return { bg: "rgba(234, 179, 8, 0.2)", text: "var(--color-warning)" };
    case "notice":
    case "info":
    default:
      return { bg: "rgba(59, 130, 246, 0.2)", text: "var(--color-accent)" };
  }
}

export const NetworkEventsView: React.FC = () => {
  const events = useNetworkWorkspaceStore((s) => s.events);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedEventId(expandedEventId === id ? null : id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <ActivityIcon size={18} style={{ color: "var(--color-accent)" }} />
            <span>Live Network Event Stream ({events.length})</span>
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
            Real-time occurrence and lifecycle change notifications from authoritative NetworkEventBus.
          </p>
        </div>
      </div>

      {isStale && (
        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            backgroundColor: "rgba(234, 179, 8, 0.15)",
            border: "1px solid var(--color-warning)",
            borderRadius: "var(--radius-xs)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-warning)",
          }}
        >
          Event broadcast buffer experienced lag. State resynchronization has been initiated automatically.
        </div>
      )}

      {events.length > 0 ? (
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
                <th style={{ padding: "var(--space-2) var(--space-3)", width: "80px" }}>Seq</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", width: "120px" }}>Timestamp</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", width: "100px" }}>Category</th>
                <th style={{ padding: "var(--space-2) var(--space-3)", width: "90px" }}>Severity</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Event Type</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Affected Entity</th>
                <th style={{ padding: "var(--space-2) var(--space-3)" }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => {
                const catStyle = getCategoryBadgeColor(evt.category);
                const sevStyle = getSeverityBadgeColor(evt.severity);
                const isExpanded = expandedEventId === evt.event_id;
                const affectedEntity =
                  evt.target_node_id ||
                  evt.target_device_id ||
                  evt.target_connection_id ||
                  evt.source_node_id ||
                  "—";

                return (
                  <React.Fragment key={evt.event_id}>
                    <tr
                      onClick={() => toggleExpand(evt.event_id)}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        cursor: "pointer",
                        backgroundColor: isExpanded ? "var(--color-surface-hover)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                        #{evt.sequence}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-muted)" }}>
                        {new Date(evt.timestamp_epoch_ms).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: catStyle.bg,
                            color: catStyle.text,
                            fontSize: "10px",
                            fontWeight: "bold",
                          }}
                        >
                          {evt.category.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: sevStyle.bg,
                            color: sevStyle.text,
                            fontSize: "10px",
                            fontWeight: "bold",
                          }}
                        >
                          {evt.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: "var(--font-weight-semibold)" }}>
                        {evt.event_type}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {evt.target_node_id ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              networkWorkspaceStore.selectEntity("node", evt.target_node_id!);
                            }}
                            style={{ color: "var(--color-accent)", textDecoration: "underline", cursor: "pointer" }}
                          >
                            {evt.target_node_id}
                          </span>
                        ) : evt.target_device_id ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              networkWorkspaceStore.selectEntity("device", evt.target_device_id!);
                            }}
                            style={{ color: "var(--color-success)", textDecoration: "underline", cursor: "pointer" }}
                          >
                            {evt.target_device_id}
                          </span>
                        ) : evt.target_connection_id ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              networkWorkspaceStore.selectEntity("connection", evt.target_connection_id!);
                            }}
                            style={{ color: "var(--color-info, #3b82f6)", textDecoration: "underline", cursor: "pointer" }}
                          >
                            {evt.target_connection_id}
                          </span>
                        ) : (
                          affectedEntity
                        )}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        {evt.summary}
                      </td>
                    </tr>

                    {/* Expandable JSON Details Row */}
                    {isExpanded && (
                      <tr style={{ backgroundColor: "var(--color-surface-subtle)", borderBottom: "1px solid var(--color-border)" }}>
                        <td colSpan={7} style={{ padding: "var(--space-3) var(--space-4)" }}>
                          <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "var(--space-1)", color: "var(--color-text-muted)" }}>
                            Event Details Payload (ID: {evt.event_id}):
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              padding: "var(--space-2)",
                              backgroundColor: "var(--color-surface)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "var(--radius-xs)",
                              fontSize: "11px",
                              fontFamily: "var(--font-mono)",
                              overflowX: "auto",
                            }}
                          >
                            {JSON.stringify(evt.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
          No network events recorded in current bounded buffer window.
        </div>
      )}
    </div>
  );
};
