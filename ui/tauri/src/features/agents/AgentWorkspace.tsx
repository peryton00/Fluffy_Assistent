/**
 * Fluffy Desktop - Agent Execution Workspace
 * Phase 11: Agent Execution Workspace UI
 * 
 * Central execution workspace visibly representing the canonical agent execution lifecycle
 * from Phases 1-10 (Plan DAG, Steps, Capability Execution, Live Timeline, Evidence,
 * Artifacts, Confirmations, and Recovery).
 */

import React, { useEffect, useState } from "react";
import { useExecutionStore } from "../../stores/executionStore";
import { ExecutionHeader } from "./ExecutionHeader";
import { ConfirmationBanner } from "./ConfirmationBanner";
import { PlanStepTimeline } from "./PlanStepTimeline";
import { ExecutionInspector } from "./ExecutionInspector";
import { LiveEventTimeline } from "./LiveEventTimeline";
import { EvidencePanel } from "./EvidencePanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import {
  BotIcon,
  LayersIcon,
  ActivityIcon,
  DatabaseIcon,
  FileTextIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  XIcon,
} from "../../components/common/Icons";

export const AgentWorkspace: React.FC = () => {
  const {
    activeTaskId,
    selectedTask,
    plan,
    steps,
    events,
    selectedStepId,
    pendingConfirmation,
    artifacts,
    evidence,
    status,
    isRunning,
    result,
    loading,
    connectionState,
    loadTasks,
    selectTask,
    selectStep,
    resolveConfirmation,
    cancelTask,
    createAndStartTask,
    stopPolling,
  } = useExecutionStore();

  const [activeBottomTab, setActiveBottomTab] = useState<"timeline" | "evidence" | "artifacts" | "result">("timeline");
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [newTaskGoal, setNewTaskGoal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadTasks();
    return () => {
      stopPolling();
    };
  }, [loadTasks, stopPolling]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    setIsSubmitting(true);
    try {
      await createAndStartTask(newTaskInput.trim(), newTaskGoal.trim() || undefined, true);
      setShowNewTaskModal(false);
      setNewTaskInput("");
      setNewTaskGoal("");
    } catch {
      // Error handled in store
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStep = steps.find((s) => s.step_id === selectedStepId) || null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        overflow: "hidden",
      }}
    >
      {/* Top Header */}
      <ExecutionHeader
        task={selectedTask}
        status={status}
        isRunning={isRunning}
        onCancel={cancelTask}
        onRefresh={() => {
          if (activeTaskId) selectTask(activeTaskId);
          else loadTasks();
        }}
        onNewTaskClick={() => setShowNewTaskModal(true)}
      />

      {/* Connection / Error Banner */}
      {connectionState === "STALE" && (
        <div
          style={{
            padding: "var(--space-2) var(--space-5)",
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.3)",
            color: "#fbbf24",
            fontSize: "11px",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <RefreshCwIcon size={12} />
          <span>Backend state synchronization disconnected. Retrying on next action.</span>
        </div>
      )}

      {/* Confirmation Required Alert Banner */}
      {pendingConfirmation && (
        <ConfirmationBanner
          confirmation={pendingConfirmation}
          loading={loading}
          onConfirm={() => resolveConfirmation(true)}
          onDeny={() => resolveConfirmation(false)}
        />
      )}

      {/* Main Content Workspace Layout */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateRows: "1fr 1fr",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-5)",
          overflow: "hidden",
        }}
      >
        {/* Top Half: Plan DAG Steps + Execution Inspector */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-4)",
            minHeight: 0,
          }}
        >
          {/* Plan DAG & Step Sequence */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <LayersIcon size={16} style={{ color: "var(--color-accent)" }} />
                <strong style={{ fontSize: "var(--font-size-xs)" }}>
                  Execution Plan ({steps.length} Steps)
                </strong>
              </div>

              {plan?.plan_id && (
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {plan.plan_id}
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-3)" }}>
              <PlanStepTimeline
                steps={steps}
                selectedStepId={selectedStepId}
                onSelectStep={selectStep}
              />
            </div>
          </div>

          {/* Execution Inspector */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <ActivityIcon size={16} style={{ color: "#38bdf8" }} />
                <strong style={{ fontSize: "var(--font-size-xs)" }}>Execution Inspector</strong>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4)" }}>
              <ExecutionInspector step={selectedStep} />
            </div>
          </div>
        </div>

        {/* Bottom Half: Tabbed Live Timeline / Evidence / Artifacts / Final Result */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* Bottom Tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface-elevated)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveBottomTab("timeline")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                border: "none",
                backgroundColor:
                  activeBottomTab === "timeline" ? "var(--color-surface)" : "transparent",
                color:
                  activeBottomTab === "timeline"
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              <ActivityIcon size={14} />
              <span>Live Timeline ({events.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveBottomTab("evidence")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                border: "none",
                backgroundColor:
                  activeBottomTab === "evidence" ? "var(--color-surface)" : "transparent",
                color:
                  activeBottomTab === "evidence"
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              <DatabaseIcon size={14} />
              <span>Evidence ({evidence.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveBottomTab("artifacts")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                border: "none",
                backgroundColor:
                  activeBottomTab === "artifacts" ? "var(--color-surface)" : "transparent",
                color:
                  activeBottomTab === "artifacts"
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              <FileTextIcon size={14} />
              <span>Artifacts ({artifacts.length})</span>
            </button>

            {result && (
              <button
                type="button"
                onClick={() => setActiveBottomTab("result")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  backgroundColor:
                    activeBottomTab === "result" ? "var(--color-surface)" : "transparent",
                  color:
                    activeBottomTab === "result"
                      ? "var(--color-accent)"
                      : "var(--color-text-secondary)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-semibold)",
                  cursor: "pointer",
                }}
              >
                <CheckCircleIcon size={14} style={{ color: "#10b981" }} />
                <span>Final Result</span>
              </button>
            )}
          </div>

          {/* Bottom Tab Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-3) var(--space-4)" }}>
            {activeBottomTab === "timeline" && <LiveEventTimeline events={events} />}
            {activeBottomTab === "evidence" && <EvidencePanel evidence={evidence} />}
            {activeBottomTab === "artifacts" && <ArtifactsPanel artifacts={artifacts} />}
            {activeBottomTab === "result" && result && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div
                  style={{
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: result.success
                      ? "rgba(16, 185, 129, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${
                      result.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
                    }`,
                    color: result.success ? "#10b981" : "#ef4444",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <strong style={{ fontSize: "var(--font-size-sm)" }}>
                    {result.success ? "Task Completed Successfully" : "Task Failed"}
                  </strong>
                  <p style={{ margin: "4px 0 0 0", color: "var(--color-text)" }}>{result.summary}</p>
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "11px",
                      color: "var(--color-text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Duration: {result.duration_ms.toFixed(2)}ms
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Task Creation Modal */}
      {showNewTaskModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Agent Run"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <BotIcon size={20} style={{ color: "var(--color-accent)" }} />
                <h3 style={{ fontSize: "var(--font-size-md)", margin: 0, fontWeight: "bold" }}>
                  Start Autonomous Agent Task
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div>
                <label
                  htmlFor="user-request-input"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                    fontWeight: "bold",
                  }}
                >
                  User Request / Instruction
                </label>
                <textarea
                  id="user-request-input"
                  rows={3}
                  value={newTaskInput}
                  onChange={(e) => setNewTaskInput(e.target.value)}
                  placeholder="e.g. Investigate network ports and generate incident report"
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--color-text)",
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--font-size-xs)",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="goal-override-input"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Goal Override (Optional)
                </label>
                <input
                  id="goal-override-input"
                  type="text"
                  value={newTaskGoal}
                  onChange={(e) => setNewTaskGoal(e.target.value)}
                  placeholder="e.g. Incident correlation & artifact creation"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--color-text)",
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--font-size-xs)",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 14px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--color-text)",
                    fontSize: "var(--font-size-xs)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTaskInput.trim()}
                  style={{
                    padding: "6px 18px",
                    backgroundColor: "var(--color-accent)",
                    border: "none",
                    borderRadius: "var(--radius-xs)",
                    color: "#ffffff",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "bold",
                    cursor: isSubmitting || !newTaskInput.trim() ? "not-allowed" : "pointer",
                    opacity: isSubmitting || !newTaskInput.trim() ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? "Starting..." : "Start Run"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
