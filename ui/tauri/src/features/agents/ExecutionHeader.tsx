/**
 * Fluffy Desktop - Execution Header Component
 * Phase 11: Agent Execution Workspace UI
 */

import React, { useState, useEffect } from "react";
import {
  ActivityIcon,
  ShieldIcon,
  RefreshCwIcon,
  XIcon,
  BotIcon,
  ClockIcon,
} from "../../components/common/Icons";
import type { AgentTask, TaskStatus } from "../../types/agent";

interface ExecutionHeaderProps {
  task: AgentTask | null;
  status: TaskStatus | "idle";
  isRunning: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onNewTaskClick: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  idle: {
    label: "IDLE",
    bg: "var(--color-surface-elevated)",
    color: "var(--color-text-muted)",
    border: "var(--color-border)",
  },
  created: {
    label: "CREATED",
    bg: "var(--color-surface-elevated)",
    color: "var(--color-text-secondary)",
    border: "var(--color-border)",
  },
  analyzing: {
    label: "ANALYZING",
    bg: "rgba(59, 130, 246, 0.12)",
    color: "#60a5fa",
    border: "rgba(59, 130, 246, 0.3)",
  },
  planning: {
    label: "PLANNING",
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#a78bfa",
    border: "rgba(139, 92, 246, 0.3)",
  },
  ready: {
    label: "READY",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#34d399",
    border: "rgba(16, 185, 129, 0.3)",
  },
  executing: {
    label: "RUNNING",
    bg: "rgba(6, 182, 212, 0.15)",
    color: "#22d3ee",
    border: "rgba(6, 182, 212, 0.4)",
  },
  waiting_confirmation: {
    label: "WAITING CONFIRMATION",
    bg: "rgba(245, 158, 11, 0.18)",
    color: "#fbbf24",
    border: "rgba(245, 158, 11, 0.4)",
  },
  waiting: {
    label: "WAITING",
    bg: "rgba(245, 158, 11, 0.12)",
    color: "#fbbf24",
    border: "rgba(245, 158, 11, 0.3)",
  },
  paused: {
    label: "PAUSED",
    bg: "rgba(107, 114, 128, 0.15)",
    color: "#9ca3af",
    border: "rgba(107, 114, 128, 0.3)",
  },
  completed: {
    label: "COMPLETED",
    bg: "rgba(16, 185, 129, 0.15)",
    color: "#10b981",
    border: "rgba(16, 185, 129, 0.4)",
  },
  failed: {
    label: "FAILED",
    bg: "rgba(239, 68, 68, 0.15)",
    color: "#ef4444",
    border: "rgba(239, 68, 68, 0.4)",
  },
  cancelled: {
    label: "CANCELLED",
    bg: "rgba(107, 114, 128, 0.15)",
    color: "#9ca3af",
    border: "rgba(107, 114, 128, 0.3)",
  },
};

export const ExecutionHeader: React.FC<ExecutionHeaderProps> = ({
  task,
  status,
  isRunning,
  onCancel,
  onRefresh,
  onNewTaskClick,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!task) {
      setElapsedSeconds(0);
      return;
    }

    const calcElapsed = () => {
      const start = task.created_at || Date.now() / 1000;
      const isTerminal = ["completed", "failed", "cancelled"].includes(task.status);
      const end = isTerminal && task.updated_at ? task.updated_at : Date.now() / 1000;
      setElapsedSeconds(Math.max(0, Math.floor(end - start)));
    };

    calcElapsed();
    if (!["completed", "failed", "cancelled"].includes(task.status)) {
      const interval = setInterval(calcElapsed, 1000);
      return () => clearInterval(interval);
    }
  }, [task]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s < 10 ? "0" : ""}${s}s`;
  };

  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-4) var(--space-5)",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Left: Task Identity & Goal */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: "280px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-accent)",
          }}
        >
          <BotIcon size={22} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              {task?.goal || task?.user_request || "Autonomous Execution Workspace"}
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              marginTop: "4px",
              fontSize: "11px",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>ID: {task?.task_id || "no_task_selected"}</span>
            <span>•</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ClockIcon size={12} />
              <span>Duration: {formatDuration(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Status & Sovereignty Tag */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "4px 10px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: statusCfg.bg,
            border: `1px solid ${statusCfg.border}`,
            color: statusCfg.color,
            fontSize: "11px",
            fontWeight: "var(--font-weight-bold)",
            letterSpacing: "0.5px",
          }}
        >
          {status === "executing" && (
            <ActivityIcon size={13} style={{ animation: "spin 2s linear infinite" }} />
          )}
          <span>{statusCfg.label}</span>
        </div>

        {/* Local Sovereignty Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "#10b981",
            fontSize: "11px",
            fontWeight: "var(--font-weight-semibold)",
          }}
          title="Canonical zero-exfiltration local execution active"
        >
          <ShieldIcon size={13} />
          <span>Local Sovereignty</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh execution state"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-xs)",
            cursor: "pointer",
          }}
        >
          <RefreshCwIcon size={13} />
          <span>Sync</span>
        </button>

        {isRunning && (
          <button
            type="button"
            onClick={onCancel}
            title="Cancel execution"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "var(--radius-xs)",
              color: "#ef4444",
              fontSize: "var(--font-size-xs)",
              cursor: "pointer",
            }}
          >
            <XIcon size={13} />
            <span>Cancel</span>
          </button>
        )}

        <button
          type="button"
          onClick={onNewTaskClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            backgroundColor: "var(--color-accent)",
            border: "none",
            borderRadius: "var(--radius-xs)",
            color: "#ffffff",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
          }}
        >
          <BotIcon size={14} />
          <span>New Run</span>
        </button>
      </div>
    </header>
  );
};
