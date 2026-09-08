/**
 * Fluffy Desktop - Live Logs Dedicated View
 * 
 * High-performance real-time execution log stream.
 * Features client-side level filtering, substring search, auto-scroll,
 * pause/resume toggle, and click-to-inspect interaction.
 */

import React, { useState, useEffect, useRef } from "react";
import { useLogsStore, logsCoordinator } from "../../../stores/logsStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import type { ExecutionLog, ExecutionLogLevel } from "../../../types/contracts";
import type { InspectorSelection } from "../../../types/ui";
import { OperationalHeader } from "../components/OperationalHeader";
import {
  SearchIcon,
  RefreshCwIcon,
  TrashIcon,
} from "../../../components/common/Icons";


export const LiveLogsView: React.FC = () => {
  const logs = useLogsStore((s) => s.logs);
  const loading = useLogsStore((s) => s.loading);
  const error = useLogsStore((s) => s.error);
  const isPaused = useLogsStore((s) => s.isPaused);
  const selectedItem = useUiStore((s) => s.selectedItem);

  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsCoordinator.start();
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== "all") {
      const lvl = log.level?.toLowerCase();
      if (filterLevel === "warn" && lvl !== "warn" && lvl !== "warning") return false;
      if (filterLevel !== "warn" && lvl !== filterLevel) return false;
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      return log.message.toLowerCase().includes(q) || log.level.toLowerCase().includes(q);
    }
    return true;
  });

  const getLevelBadge = (level: ExecutionLogLevel | string) => {
    switch (level?.toLowerCase()) {
      case "action":
        return { label: "ACTION", color: "var(--color-accent)", bg: "rgba(124, 58, 237, 0.12)", border: "rgba(124, 58, 237, 0.25)" };
      case "error":
        return { label: "ERROR", color: "var(--color-danger)", bg: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.25)" };
      case "warn":
      case "warning":
        return { label: "WARN", color: "var(--color-warning)", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.25)" };
      case "system":
        return { label: "SYSTEM", color: "var(--color-success)", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.25)" };
      case "info":
      default:
        return { label: "INFO", color: "var(--color-text-secondary)", bg: "var(--color-surface-elevated)", border: "var(--color-border-subtle)" };
    }
  };

  const handleSelectLog = (log: ExecutionLog, idx: number) => {
    const selection: InspectorSelection = {
      id: `log-view-${idx}-${log.timestamp || Date.now()}`,
      type: "log",
      title: `Log Event: ${log.level.toUpperCase()}`,
      data: {
        message: log.message,
        level: log.level,
        timestamp: log.timestamp || "Live stream",
      },
    };
    uiStore.setSelectedItem(selection, true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", width: "100%", height: "100%", minHeight: "500px" }}>
      <OperationalHeader
        title="Operations — Live Logs"
        subtitle="Streaming backend execution log journal (5,000ms polling cadence)"
      />

      {/* Controls Bar: Search, Level Filter, Pause/Resume, AutoScroll, Refresh, Clear */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 200px", maxWidth: "320px" }}>
          <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter logs by keyword..."
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              fontSize: "12px",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
        </div>

        {/* Level Filter Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {["all", "action", "system", "info", "warn", "error"].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilterLevel(lvl)}
              style={{
                padding: "2px 8px",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                textTransform: "uppercase",
                borderRadius: "var(--radius-xs)",
                backgroundColor: filterLevel === lvl ? "var(--color-accent)" : "var(--color-surface-elevated)",
                color: filterLevel === lvl ? "#ffffff" : "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                cursor: "pointer",
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => logsCoordinator.togglePause()}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: isPaused ? "rgba(245, 158, 11, 0.15)" : "var(--color-surface-elevated)",
              color: isPaused ? "var(--color-warning)" : "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            {isPaused ? "▶ Resume Stream" : "⏸ Pause Stream"}
          </button>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: autoScroll ? "var(--color-surface-elevated)" : "transparent",
              color: autoScroll ? "var(--color-accent)" : "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>

          <button
            type="button"
            onClick={() => logsCoordinator.clearLogs()}
            title="Clear View"
            aria-label="Clear View"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <TrashIcon size={12} />
          </button>

          <button
            type="button"
            onClick={() => logsCoordinator.refreshNow()}
            title="Refresh Logs Now"
            aria-label="Refresh Logs Now"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <RefreshCwIcon size={12} />
          </button>
        </div>
      </div>

      {/* Log Console Canvas */}
      <div
        ref={logContainerRef}
        role="log"
        aria-live="polite"
        style={{
          flex: 1,
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-3)",
          overflowY: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {loading && logs.length === 0 ? (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-muted)" }}>
            Connecting to log socket stream...
          </div>
        ) : error && logs.length === 0 ? (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-danger)" }}>
            Failed to stream logs: {error.message}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-muted)" }}>
            {searchQuery || filterLevel !== "all" ? "No logs match current filters" : "No execution logs captured"}
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            const badge = getLevelBadge(log.level);
            const isSelected = selectedItem?.type === "log" && selectedItem?.data?.message === log.message;

            return (
              <div
                key={`${idx}-${log.message.slice(0, 30)}`}
                onClick={() => handleSelectLog(log, idx)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-2)",
                  padding: "3px 6px",
                  borderRadius: "2px",
                  backgroundColor: isSelected ? "var(--color-surface-elevated)" : "transparent",
                  cursor: "pointer",
                  lineHeight: 1.4,
                  transition: "background-color var(--transition-fast)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-surface)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: "var(--font-weight-bold)",
                    padding: "1px 5px",
                    borderRadius: "2px",
                    color: badge.color,
                    backgroundColor: badge.bg,
                    border: `1px solid ${badge.border}`,
                    flexShrink: 0,
                  }}
                >
                  {badge.label}
                </span>

                <span style={{ color: "var(--color-text)", wordBreak: "break-all", flex: 1 }}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-muted)" }}>
        <span>Showing {filteredLogs.length} of {logs.length} entries</span>
        <span>{isPaused ? "STREAM PAUSED" : "POLLING ACTIVE (5,000ms)"}</span>
      </div>
    </div>
  );
};
