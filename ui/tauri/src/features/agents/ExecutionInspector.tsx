/**
 * Fluffy Desktop - Execution Inspector Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Provides safe, structured inspection of the selected step and capability execution.
 */

import React, { useState } from "react";
import {
  ShieldIcon,
  CpuIcon,
  DatabaseIcon,
  FileTextIcon,
  LayersIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from "../../components/common/Icons";
import type { PlanStep } from "../../types/agent";

interface ExecutionInspectorProps {
  step: PlanStep | null;
}

export const ExecutionInspector: React.FC<ExecutionInspectorProps> = ({ step }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!step) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "var(--space-8)",
          color: "var(--color-text-muted)",
          textAlign: "center",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <LayersIcon size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.6 }} />
        <span>Select an execution step to view runtime parameters and outputs.</span>
      </div>
    );
  }

  const execType = step.execution_type || "data";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", height: "100%" }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3
            style={{
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-bold)",
              margin: 0,
              color: "var(--color-text)",
            }}
          >
            {step.objective}
          </h3>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
            }}
          >
            {step.step_id}
          </span>
        </div>

        {step.description && step.description !== step.objective && (
          <p
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-secondary)",
              marginTop: "4px",
              lineHeight: 1.4,
            }}
          >
            {step.description}
          </p>
        )}
      </div>

      {/* Meta Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          borderRadius: "var(--radius-xs)",
          backgroundColor: "var(--color-surface-elevated)",
          border: "1px solid var(--color-border)",
          fontSize: "11px",
        }}
      >
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>Type: </span>
          <strong style={{ color: "var(--color-text)", textTransform: "uppercase" }}>{execType}</strong>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>Status: </span>
          <strong style={{ color: "var(--color-text)", textTransform: "capitalize" }}>{step.status}</strong>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>Attempts: </span>
          <strong style={{ color: "var(--color-text)" }}>{step.attempt_count}</strong>
        </div>
        {step.completed_at && (
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Completed: </span>
            <strong style={{ color: "var(--color-text)" }}>
              {new Date(step.completed_at * 1000).toLocaleTimeString()}
            </strong>
          </div>
        )}
      </div>

      {/* Error Banner if step failed */}
      {step.error && (
        <div
          style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold" }}>
            <AlertCircleIcon size={14} />
            <span>Execution Error</span>
          </div>
          <p style={{ margin: "4px 0 0 0", color: "#fca5a5" }}>{step.error}</p>
        </div>
      )}

      {/* Capability-Specific Structured Inspector */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          overflowY: "auto",
        }}
      >
        {execType === "tool" && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-2)" }}>
              <ShieldIcon size={14} style={{ color: "#38bdf8" }} />
              <strong style={{ color: "var(--color-text)" }}>Tool Execution Details</strong>
            </div>
            <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              <div>Requirement: <code>{step.tool_requirement || "Local Native Tool"}</code></div>
              <div>Execution Mode: <strong>Zero-Exfiltration Local</strong></div>
              {step.input_parameters && Object.keys(step.input_parameters).length > 0 && (
                <div style={{ marginTop: "6px" }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Safe Parameters:</span>
                  <pre
                    style={{
                      margin: "4px 0 0 0",
                      padding: "6px",
                      backgroundColor: "var(--color-surface-elevated)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {JSON.stringify(step.input_parameters, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {execType === "model" && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-2)" }}>
              <CpuIcon size={14} style={{ color: "#c084fc" }} />
              <strong style={{ color: "var(--color-text)" }}>Local AI Reasoning Details</strong>
            </div>
            <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              <div>Task Type: <strong>Reasoning & Analysis</strong></div>
              <div>Privacy Guarantee: <strong>Confidential local inference; zero cloud dispatch.</strong></div>
              {step.model_requirement && (
                <div style={{ marginTop: "4px" }}>
                  Model Target: <code>{JSON.stringify(step.model_requirement)}</code>
                </div>
              )}
            </div>
          </div>
        )}

        {execType === "knowledge" && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-2)" }}>
              <DatabaseIcon size={14} style={{ color: "#34d399" }} />
              <strong style={{ color: "var(--color-text)" }}>Knowledge Retrieval</strong>
            </div>
            <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              <div>Domain: <strong>Local Incident & Telemetry Base</strong></div>
              {step.knowledge_requirement && (
                <div style={{ marginTop: "4px" }}>
                  Query Target: <code>{JSON.stringify(step.knowledge_requirement)}</code>
                </div>
              )}
            </div>
          </div>
        )}

        {execType === "artifact" && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-2)" }}>
              <FileTextIcon size={14} style={{ color: "#fbbf24" }} />
              <strong style={{ color: "var(--color-text)" }}>Artifact Generation</strong>
            </div>
            <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              <div>Output Format: <strong>Markdown Deliverable</strong></div>
              {step.artifact_requirement && (
                <div style={{ marginTop: "4px" }}>
                  Target Specs: <code>{JSON.stringify(step.artifact_requirement)}</code>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step Output if available */}
        {step.output !== undefined && step.output !== null && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-2)" }}>
              <CheckCircleIcon size={14} style={{ color: "#10b981" }} />
              <strong style={{ color: "var(--color-text)" }}>Observation / Result</strong>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "8px",
                backgroundColor: "var(--color-surface-elevated)",
                borderRadius: "var(--radius-xs)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
                maxHeight: "160px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {typeof step.output === "object"
                ? JSON.stringify(step.output, null, 2)
                : String(step.output)}
            </pre>
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "11px",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {showRaw ? "Hide Raw Step Data" : "View Raw Step Data"}
        </button>

        {showRaw && (
          <pre
            style={{
              margin: "6px 0 0 0",
              padding: "8px",
              backgroundColor: "var(--color-surface-elevated)",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              maxHeight: "140px",
              overflowY: "auto",
            }}
          >
            {JSON.stringify(step, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
