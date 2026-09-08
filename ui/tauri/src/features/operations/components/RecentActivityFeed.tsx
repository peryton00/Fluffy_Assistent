/**
 * Fluffy Desktop - Recent Activity Feed Component
 * 
 * Displays real-time execution logs and event stream from logsStore.
 * Semantic badges for ACTION, SYSTEM, INFO, WARNING, ERROR.
 * Clicking an entry opens its deep properties in the Inspector drawer.
 */

import React from "react";
import { useLogsStore, logsCoordinator } from "../../../stores/logsStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import type { ExecutionLog, ExecutionLogLevel } from "../../../types/contracts";
import type { InspectorSelection } from "../../../types/ui";
import { RefreshCwIcon, TerminalIcon, ChevronRightIcon } from "../../../components/common/Icons";

interface RecentActivityFeedProps {
  limit?: number;
  showViewAll?: boolean;
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  limit = 8,
  showViewAll = true,
}) => {
  const logs = useLogsStore((s) => s.logs);
  const loading = useLogsStore((s) => s.loading);
  const error = useLogsStore((s) => s.error);
  const selectedItem = useUiStore((s) => s.selectedItem);

  const displayLogs = logs.slice(-limit).reverse();

  const getLevelBadge = (level: ExecutionLogLevel | string) => {
    switch (level?.toLowerCase()) {
      case "action":
        return {
          label: "ACTION",
          color: "var(--color-accent)",
          bg: "rgba(124, 58, 237, 0.12)",
          border: "rgba(124, 58, 237, 0.25)",
        };
      case "error":
        return {
          label: "ERROR",
          color: "var(--color-danger)",
          bg: "rgba(239, 68, 68, 0.12)",
          border: "rgba(239, 68, 68, 0.25)",
        };
      case "warn":
      case "warning":
        return {
          label: "WARN",
          color: "var(--color-warning)",
          bg: "rgba(245, 158, 11, 0.12)",
          border: "rgba(245, 158, 11, 0.25)",
        };
      case "system":
        return {
          label: "SYSTEM",
          color: "var(--color-success)",
          bg: "rgba(16, 185, 129, 0.12)",
          border: "rgba(16, 185, 129, 0.25)",
        };
      case "info":
      default:
        return {
          label: "INFO",
          color: "var(--color-text-secondary)",
          bg: "var(--color-surface-elevated)",
          border: "var(--color-border-subtle)",
        };
    }
  };

  const handleSelectLog = (log: ExecutionLog, idx: number) => {
    const selection: InspectorSelection = {
      id: `log-${idx}-${log.timestamp || Date.now()}`,
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

  const handleViewAllLogs = () => {
    uiStore.setActiveSidebarView("logs");
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: "var(--color-accent)", display: "flex" }}>
            <TerminalIcon size={14} />
          </span>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            Recent Activity & Event Stream
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => logsCoordinator.refreshNow()}
            title="Refresh Logs"
            aria-label="Refresh Logs"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "22px",
              height: "22px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border-subtle)",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <RefreshCwIcon size={11} />
          </button>
          {showViewAll && (
            <button
              type="button"
              onClick={handleViewAllLogs}
              style={{
                fontSize: "11px",
                color: "var(--color-accent)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "2px",
                padding: "2px 4px",
              }}
            >
              <span>Live Logs</span>
              <ChevronRightIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <div style={{ padding: "var(--space-4)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Connecting to execution log stream...
        </div>
      ) : error && logs.length === 0 ? (
        <div style={{ padding: "var(--space-4)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
          Log stream unavailable ({error.message})
        </div>
      ) : displayLogs.length === 0 ? (
        <div style={{ padding: "var(--space-4)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          No recent activity logged
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {displayLogs.map((log, idx) => {
            const badge = getLevelBadge(log.level);
            const isSelected = selectedItem?.type === "log" && selectedItem?.data?.message === log.message;

            return (
              <div
                key={`${idx}-${log.message.slice(0, 20)}`}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectLog(log, idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectLog(log, idx);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-2)",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: isSelected ? "var(--color-surface-elevated)" : "transparent",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.4,
                  transition: "background-color var(--transition-fast)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
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
                    marginTop: "1px",
                  }}
                >
                  {badge.label}
                </span>

                <span
                  style={{
                    color: "var(--color-text)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {log.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
