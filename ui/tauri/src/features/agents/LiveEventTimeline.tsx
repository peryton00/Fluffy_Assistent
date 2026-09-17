/**
 * Fluffy Desktop - Live Event Timeline Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Displays the canonical chronological execution event stream.
 */

import React, { useState } from "react";
import type { AgentEvent } from "../../types/agent";

interface LiveEventTimelineProps {
  events: AgentEvent[];
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  task_started: { bg: "rgba(6, 182, 212, 0.15)", color: "#22d3ee" },
  task_completed: { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981" },
  task_failed: { bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444" },
  task_cancelled: { bg: "rgba(107, 114, 128, 0.15)", color: "#9ca3af" },
  step_started: { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" },
  step_completed: { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981" },
  step_failed: { bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444" },
  step_retried: { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" },
  retry_started: { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" },
  recovery_started: { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" },
  tool_started: { bg: "rgba(56, 189, 248, 0.12)", color: "#38bdf8" },
  tool_completed: { bg: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" },
  model_started: { bg: "rgba(192, 132, 252, 0.12)", color: "#c084fc" },
  model_completed: { bg: "rgba(192, 132, 252, 0.15)", color: "#c084fc" },
  knowledge_completed: { bg: "rgba(52, 211, 153, 0.15)", color: "#34d399" },
  artifact_completed: { bg: "rgba(251, 191, 36, 0.15)", color: "#fbbf24" },
  confirmation_required: { bg: "rgba(245, 158, 11, 0.2)", color: "#fbbf24" },
  confirmation_resolved: { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981" },
};

export const LiveEventTimeline: React.FC<LiveEventTimelineProps> = ({ events }) => {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        Waiting for execution events...
      </div>
    );
  }

  // Display in reverse chronological order (latest on top)
  const displayEvents = [...events].reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {displayEvents.map((evt) => {
        const type = evt.event_type || evt.type || "unknown";
        const colorCfg = EVENT_TYPE_COLORS[type] || {
          bg: "var(--color-surface-elevated)",
          color: "var(--color-text-secondary)",
        };
        const isExpanded = expandedEventId === evt.event_id;
        const timeStr = new Date(evt.timestamp * 1000).toLocaleTimeString();

        return (
          <div
            key={evt.event_id}
            style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-muted)",
                    fontSize: "10px",
                  }}
                >
                  {timeStr}
                </span>

                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: colorCfg.bg,
                    color: colorCfg.color,
                    fontWeight: "bold",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                  }}
                >
                  {type.replace(/_/g, " ")}
                </span>

                {evt.step_id && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-secondary)",
                      fontSize: "10px",
                    }}
                  >
                    [{evt.step_id}]
                  </span>
                )}
              </div>

              {evt.payload && Object.keys(evt.payload).length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedEventId(isExpanded ? null : evt.event_id)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px 6px",
                    fontSize: "10px",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {isExpanded ? "Hide" : "Details"}
                </button>
              )}
            </div>

            {isExpanded && evt.payload && (
              <pre
                style={{
                  margin: "6px 0 0 0",
                  padding: "6px",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-secondary)",
                  maxHeight: "120px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(evt.payload, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
};
