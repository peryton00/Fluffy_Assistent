/**
 * Fluffy Desktop - Plan Step Timeline Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Renders the canonical AgentPlan dependency sequence with step states,
 * capabilities, and real-time execution status.
 */

import React from "react";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  LayersIcon,
  ActivityIcon,
  CpuIcon,
  DatabaseIcon,
  FileTextIcon,
  ShieldIcon,
} from "../../components/common/Icons";
import type { PlanStep } from "../../types/agent";

interface PlanStepTimelineProps {
  steps: PlanStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

const EXECUTION_TYPE_ICONS: Record<string, React.FC<{ size?: number }>> = {
  tool: ShieldIcon,
  model: CpuIcon,
  knowledge: DatabaseIcon,
  artifact: FileTextIcon,
  data: LayersIcon,
};

const EXECUTION_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  tool: { label: "TOOL", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)" },
  model: { label: "MODEL", color: "#c084fc", bg: "rgba(192, 132, 252, 0.12)" },
  knowledge: { label: "KNOWLEDGE", color: "#34d399", bg: "rgba(52, 211, 153, 0.12)" },
  artifact: { label: "ARTIFACT", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)" },
  data: { label: "DATA", color: "#9ca3af", bg: "rgba(156, 163, 175, 0.12)" },
};

export const PlanStepTimeline: React.FC<PlanStepTimelineProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
}) => {
  if (steps.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        No plan steps registered for this task.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {steps.map((step, idx) => {
        const isSelected = selectedStepId === step.step_id;
        const execType = step.execution_type || "data";
        const typeCfg = EXECUTION_TYPE_LABELS[execType] || EXECUTION_TYPE_LABELS.data;
        const TypeIcon = EXECUTION_TYPE_ICONS[execType] || LayersIcon;

        // Step status visual styling
        let statusColor = "var(--color-text-muted)";
        let statusBg = "var(--color-surface-elevated)";
        let StatusIcon = ClockIcon;

        if (step.status === "completed") {
          statusColor = "#10b981";
          statusBg = "rgba(16, 185, 129, 0.15)";
          StatusIcon = CheckCircleIcon;
        } else if (step.status === "executing") {
          statusColor = "#22d3ee";
          statusBg = "rgba(6, 182, 212, 0.15)";
          StatusIcon = ActivityIcon;
        } else if (step.status === "waiting_confirmation") {
          statusColor = "#fbbf24";
          statusBg = "rgba(245, 158, 11, 0.15)";
          StatusIcon = AlertTriangleIcon;
        } else if (step.status === "failed") {
          statusColor = "#ef4444";
          statusBg = "rgba(239, 68, 68, 0.15)";
          StatusIcon = AlertCircleIcon;
        }

        return (
          <div
            key={step.step_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectStep(step.step_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectStep(step.step_id);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: isSelected
                ? "var(--color-surface-elevated)"
                : "var(--color-surface)",
              border: isSelected
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {/* Left: Step Index, Status Icon & Title */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  minWidth: "18px",
                }}
              >
                {idx + 1}.
              </span>

              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: statusBg,
                  color: statusColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <StatusIcon size={14} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    fontWeight: isSelected ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
                    color: isSelected ? "var(--color-text)" : "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {step.objective}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "2px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {step.step_id}
                  </span>

                  {step.dependencies.length > 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      (deps: {step.dependencies.join(", ")})
                    </span>
                  )}

                  {step.attempt_count > 1 && (
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: "bold",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        color: "#fbbf24",
                      }}
                    >
                      Retry {step.attempt_count}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Capability Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: typeCfg.bg,
                  color: typeCfg.color,
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  letterSpacing: "0.5px",
                }}
              >
                <TypeIcon size={11} />
                <span>{typeCfg.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
