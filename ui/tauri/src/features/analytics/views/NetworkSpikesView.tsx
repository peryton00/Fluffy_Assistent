/**
 * Fluffy Desktop - Network Spikes Analytics View
 * 
 * Anomaly detection and sudden traffic surges on active network interfaces.
 * Only surfaces genuine recorded bandwidth spikes without fabricated causal attributions.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import { useAnalyticsStore } from "../../../stores/analyticsStore";
import { useUiStore } from "../../../stores/uiStore";
import {
  ZapIcon,
  CheckCircleIcon,
  ClockIcon,
} from "../../../components/common/Icons";

export const NetworkSpikesView: React.FC = () => {
  const { spikes, summary } = useAnalyticsStore();
  const selectInspectorItem = useUiStore((s) => s.selectInspectorItem);

  const handleSelectSpike = (spike: (typeof spikes)[0]) => {
    selectInspectorItem({
      type: "analyticsPoint",
      id: spike.id,
      title: `Network Spike @ ${spike.timeStr}`,
      data: { ...spike },
    });
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-warning-subtle)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ZapIcon size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Network Spikes & Traffic Surges
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Real-time anomaly detection for bandwidth spikes (&gt;= 2.0 Mbps)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)" }}>
          <span style={{ color: "var(--color-text-muted)" }}>
            Total Sent: <strong style={{ color: "var(--color-text)" }}>{summary.network.totalSentMb} MB</strong>
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>
            Total Recv: <strong style={{ color: "var(--color-text)" }}>{summary.network.totalRecvMb} MB</strong>
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {spikes.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: "var(--space-2)",
              padding: "var(--space-8)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <CheckCircleIcon size={32} style={{ color: "var(--color-success)", opacity: 0.8 }} />
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
              No Network Spikes Detected
            </p>
            <p style={{ fontSize: "var(--font-size-xs)", maxWidth: "380px", margin: "4px 0 0" }}>
              Network activity has remained steady within normal bandwidth thresholds during the current monitoring window.
            </p>
          </div>
        ) : (
          <div
            style={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", textAlign: "left", fontSize: "var(--font-size-xs)", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface-elevated)",
                    color: "var(--color-text-muted)",
                    fontWeight: "var(--font-weight-semibold)",
                  }}
                >
                  <th style={{ padding: "8px 12px" }}>Time</th>
                  <th style={{ padding: "8px 12px" }}>Spike Type</th>
                  <th style={{ padding: "8px 12px" }}>Peak Speed</th>
                  <th style={{ padding: "8px 12px" }}>Details</th>
                </tr>
              </thead>
              <tbody style={{ fontFamily: "var(--font-mono)" }}>
                {spikes.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => handleSelectSpike(s)}
                    style={{
                      borderBottom: "1px solid var(--color-border-subtle)",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "8px 12px", color: "var(--color-text)", display: "flex", alignItems: "center", gap: "6px", fontFamily: "inherit" }}>
                      <ClockIcon size={12} style={{ color: "var(--color-text-muted)" }} />
                      {s.timeStr}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "var(--radius-xs)",
                          fontSize: "10px",
                          backgroundColor: "var(--color-warning-subtle)",
                          color: "var(--color-warning)",
                          border: "1px solid var(--color-warning-border)",
                          fontWeight: "var(--font-weight-semibold)",
                        }}
                      >
                        Traffic Surge
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: "var(--font-weight-bold)", color: "var(--color-warning)" }}>
                      {s.speedMbps.toFixed(2)} Mbps
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--color-text-muted)", fontSize: "11px" }}>
                      {s.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
