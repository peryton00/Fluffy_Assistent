/**
 * Fluffy Desktop - Network Security View (Phase N12: Guardian Integration)
 * 
 * Presentation layer for security observations and anomaly events
 * evaluated by Guardian and recorded onto the authoritative NetworkEventBus.
 * 
 * Zero Emojis, Read-Only Projection.
 */

import React, { useState } from "react";
import { useNetworkWorkspaceStore, networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { ShieldIcon, ExternalLinkIcon, LayersIcon } from "../../../components/common/Icons";
import type { EventSeverityKind } from "../../../types/contracts";

export const NetworkSecurityView: React.FC = () => {
  const events = useNetworkWorkspaceStore((s) => s.events);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>("all");
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  // Filter for real security category events or security-related event types
  const securityEvents = events.filter(
    (e) =>
      e.category === "security" ||
      e.event_type.toLowerCase().includes("auth") ||
      e.event_type.toLowerCase().includes("security") ||
      e.event_type.toLowerCase().includes("anomaly") ||
      e.event_type.toLowerCase().includes("violation") ||
      e.event_type.toLowerCase().includes("unknown")
  );

  const criticalCount = securityEvents.filter((e) => e.severity === "critical" || e.severity === "error").length;
  const warningCount = securityEvents.filter((e) => e.severity === "warning").length;
  const noticeCount = securityEvents.filter((e) => e.severity === "notice" || e.severity === "info").length;

  const filteredEvents = securityEvents.filter((e) => {
    if (selectedSeverityFilter === "all") return true;
    if (selectedSeverityFilter === "critical") return e.severity === "critical" || e.severity === "error";
    if (selectedSeverityFilter === "warning") return e.severity === "warning";
    if (selectedSeverityFilter === "notice") return e.severity === "notice" || e.severity === "info";
    return true;
  });

  const toggleExpand = (eventId: string) => {
    setExpandedEventIds((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  };

  const getSeverityStyle = (sev: EventSeverityKind) => {
    switch (sev) {
      case "critical":
      case "error":
        return {
          bg: "rgba(239, 68, 68, 0.15)",
          color: "var(--color-danger, #ef4444)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        };
      case "warning":
        return {
          bg: "rgba(234, 179, 8, 0.15)",
          color: "var(--color-warning, #eab308)",
          border: "1px solid rgba(234, 179, 8, 0.3)",
        };
      default:
        return {
          bg: "rgba(59, 130, 246, 0.12)",
          color: "var(--color-info, #3b82f6)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
        };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Header & Status Banner */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <ShieldIcon size={20} style={{ color: "var(--color-danger, #ef4444)" }} />
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)" }}>
              Network Security Observations (Guardian Behavioral Intelligence)
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              Real-time security telemetry evaluated by Guardian and recorded on the authoritative event bus.
            </div>
          </div>
        </div>
        {isStale && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "rgba(234, 179, 8, 0.15)",
              color: "var(--color-warning, #eab308)",
              fontSize: "11px",
              fontWeight: "bold",
            }}
          >
            STALE SYNC
          </span>
        )}
      </div>

      {/* Metrics Summary Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--color-text-muted)", fontWeight: "bold" }}>
            Total Observations
          </div>
          <div style={{ fontSize: "18px", fontWeight: "bold", marginTop: "2px" }}>
            {securityEvents.length}
          </div>
        </div>

        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--color-danger, #ef4444)", fontWeight: "bold" }}>
            Critical / Error
          </div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--color-danger, #ef4444)", marginTop: "2px" }}>
            {criticalCount}
          </div>
        </div>

        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--color-warning, #eab308)", fontWeight: "bold" }}>
            Warning
          </div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--color-warning, #eab308)", marginTop: "2px" }}>
            {warningCount}
          </div>
        </div>

        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--color-info, #3b82f6)", fontWeight: "bold" }}>
            Notice / Info
          </div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--color-info, #3b82f6)", marginTop: "2px" }}>
            {noticeCount}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        {[
          { id: "all", label: `All (${securityEvents.length})` },
          { id: "critical", label: `Critical (${criticalCount})` },
          { id: "warning", label: `Warning (${warningCount})` },
          { id: "notice", label: `Notice (${noticeCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedSeverityFilter(tab.id)}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              borderRadius: "var(--radius-xs)",
              border: "1px solid",
              borderColor: selectedSeverityFilter === tab.id ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: selectedSeverityFilter === tab.id ? "var(--color-surface-elevated)" : "var(--color-surface)",
              color: selectedSeverityFilter === tab.id ? "var(--color-text)" : "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Security Observations Table */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
          Security Observations & Events ({filteredEvents.length})
        </h2>
        {filteredEvents.length > 0 ? (
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
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "80px" }}>Sequence</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "100px" }}>Timestamp</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "90px" }}>Severity</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "160px" }}>Kind / Type</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "180px" }}>Target Entity</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Observation Summary</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "80px", textAlign: "center" }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt) => {
                  const sevStyle = getSeverityStyle(evt.severity);
                  const isExpanded = !!expandedEventIds[evt.event_id];
                  const details = evt.details || {};
                  const evidence = Array.isArray(details.evidence) ? details.evidence : [];

                  return (
                    <React.Fragment key={evt.event_id}>
                      <tr style={{ borderBottom: isExpanded ? "none" : "1px solid var(--color-border-subtle)" }}>
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
                              backgroundColor: sevStyle.bg,
                              color: sevStyle.color,
                              border: sevStyle.border,
                              fontSize: "10px",
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            {evt.severity.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: "var(--font-weight-medium)" }}>
                          {details.anomaly_kind != null ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{String(details.anomaly_kind)}</span>
                          ) : (
                            <span>{evt.event_type}</span>
                          )}
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                          {evt.target_node_id ? (
                            <button
                              type="button"
                              onClick={() => networkWorkspaceStore.selectEntity("node", evt.target_node_id!)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--color-accent-purple, #a855f7)",
                                textDecoration: "underline",
                                cursor: "pointer",
                                padding: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontFamily: "inherit",
                                fontSize: "inherit",
                              }}
                            >
                              <span>{evt.target_node_id}</span>
                              <ExternalLinkIcon size={10} />
                            </button>
                          ) : evt.target_device_id ? (
                            <button
                              type="button"
                              onClick={() => networkWorkspaceStore.selectEntity("device", evt.target_device_id!)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--color-success, #22c55e)",
                                textDecoration: "underline",
                                cursor: "pointer",
                                padding: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontFamily: "inherit",
                                fontSize: "inherit",
                              }}
                            >
                              <span>{evt.target_device_id}</span>
                              <ExternalLinkIcon size={10} />
                            </button>
                          ) : evt.target_connection_id ? (
                            <button
                              type="button"
                              onClick={() => networkWorkspaceStore.selectEntity("connection", evt.target_connection_id!)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--color-info, #3b82f6)",
                                textDecoration: "underline",
                                cursor: "pointer",
                                padding: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontFamily: "inherit",
                                fontSize: "inherit",
                              }}
                            >
                              <span>{evt.target_connection_id}</span>
                              <ExternalLinkIcon size={10} />
                            </button>
                          ) : details.affected_ip != null ? (
                            <span style={{ color: "var(--color-text-secondary)" }}>{String(details.affected_ip)}</span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                          <div>{evt.summary}</div>
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => toggleExpand(evt.event_id)}
                            style={{
                              padding: "2px 6px",
                              fontSize: "10px",
                              fontWeight: "var(--font-weight-medium)",
                              background: "var(--color-surface-elevated)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "var(--radius-xs)",
                              color: "var(--color-text)",
                              cursor: "pointer",
                            }}
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <td colSpan={7} style={{ padding: "var(--space-3) var(--space-4)" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "11px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: "bold", color: "var(--color-text-muted)" }}>
                                <LayersIcon size={12} />
                                <span>Observation Evidence & Technical Context</span>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "4px" }}>
                                {details.observation_id != null && (
                                  <>
                                    <span style={{ color: "var(--color-text-muted)" }}>Occurrence ID:</span>
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{String(details.observation_id)}</span>
                                  </>
                                )}
                                {details.affected_interface != null && (
                                  <>
                                    <span style={{ color: "var(--color-text-muted)" }}>Affected Interface:</span>
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{String(details.affected_interface)}</span>
                                  </>
                                )}
                                {details.affected_mac != null && (
                                  <>
                                    <span style={{ color: "var(--color-text-muted)" }}>Affected MAC:</span>
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{String(details.affected_mac)}</span>
                                  </>
                                )}
                                {details.affected_pid != null && (
                                  <>
                                    <span style={{ color: "var(--color-text-muted)" }}>Affected PID:</span>
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{String(details.affected_pid)}</span>
                                  </>
                                )}
                              </div>
                              {evidence.length > 0 && (
                                <div style={{ marginTop: "var(--space-1)" }}>
                                  <span style={{ color: "var(--color-text-muted)", fontWeight: "var(--font-weight-medium)" }}>Evidence Traces:</span>
                                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                                    {evidence.map((evItem: unknown, idx: number) => (
                                      <li key={idx} style={{ color: "var(--color-text)" }}>
                                        {String(evItem)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
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
            No anomalous or security-relevant network observations matching current filter.
          </div>
        )}
      </div>
    </div>
  );
};

