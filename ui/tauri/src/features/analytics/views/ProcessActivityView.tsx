/**
 * Fluffy Desktop - Process Activity Analytics View
 * 
 * Operational breakdown of CPU-heavy and Memory-heavy processes.
 * Derived directly from authoritative telemetry without creating duplicate process scans.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import { useAnalyticsStore } from "../../../stores/analyticsStore";
import { useUiStore } from "../../../stores/uiStore";
import {
  CpuIcon,
  DatabaseIcon,
  TrendingUpIcon,
} from "../../../components/common/Icons";

export const ProcessActivityView: React.FC = () => {
  const { topCpuProcesses, topRamProcesses, summary } = useAnalyticsStore();
  const selectInspectorItem = useUiStore((s) => s.selectInspectorItem);

  const handleSelectProcess = (p: { pid: number; name: string; cpu_percent?: number; ram_mb?: number }) => {
    selectInspectorItem({
      type: "process",
      id: String(p.pid),
      title: `${p.name} (PID: ${p.pid})`,
      data: { ...p },
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
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUpIcon size={18} />
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
              Process Activity Breakdown
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Real-time resource distribution across {summary.processCount} active processes.
            </p>
          </div>
        </div>
      </header>

      {/* Main split */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-5) var(--space-6)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {/* Left Column: Top CPU Consumers */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--color-border-subtle)",
              paddingBottom: "var(--space-2)",
            }}
          >
            <h3
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <CpuIcon size={14} style={{ color: "var(--color-accent)" }} />
              Highest CPU Load Processes
            </h3>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              Top {topCpuProcesses.length}
            </span>
          </div>

          {topCpuProcesses.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "140px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              No CPU telemetry available for processes
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {topCpuProcesses.map((p) => {
                const percent = Math.min(Math.max(p.cpu_percent || 0, 0), 100);
                return (
                  <div
                    key={`cpu-${p.pid}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectProcess(p)}
                    style={{
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      cursor: "pointer",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--font-size-xs)", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                        {p.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)" }}>
                        <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                          PID: {p.pid}
                        </span>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-accent)" }}>
                          {(p.cpu_percent || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div style={{ width: "100%", height: "6px", borderRadius: "999px", backgroundColor: "var(--color-surface)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "999px",
                          backgroundColor: "var(--color-accent)",
                          width: `${Math.max(percent, 2)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Top RAM Consumers */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--color-border-subtle)",
              paddingBottom: "var(--space-2)",
            }}
          >
            <h3
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <DatabaseIcon size={14} style={{ color: "var(--color-warning)" }} />
              Highest Memory Consuming Processes
            </h3>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              Top {topRamProcesses.length}
            </span>
          </div>

          {topRamProcesses.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "140px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              No RAM telemetry available for processes
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {topRamProcesses.map((p) => {
                const ramMb = Math.round(p.ram_mb || 0);
                return (
                  <div
                    key={`ram-${p.pid}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectProcess(p)}
                    style={{
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      cursor: "pointer",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--font-size-xs)", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                        {p.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)" }}>
                        <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                          PID: {p.pid}
                        </span>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-warning)" }}>
                          {ramMb} MB
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar (relative to 2GB ceiling for visual clarity) */}
                    <div style={{ width: "100%", height: "6px", borderRadius: "999px", backgroundColor: "var(--color-surface)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "999px",
                          backgroundColor: "var(--color-warning)",
                          width: `${Math.min(Math.max((ramMb / 2048) * 100, 2), 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
