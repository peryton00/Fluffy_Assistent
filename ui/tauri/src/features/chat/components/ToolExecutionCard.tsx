/**
 * Fluffy Desktop - ToolExecutionCard Component
 * 
 * Displays structured operational command execution results inside the chat stream.
 */

import React, { useState } from "react";
import { 
  TerminalIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExternalLinkIcon, 
  CopyIcon, 
  CheckIcon 
} from "../../../components/common/Icons";
import { useUiStore } from "../../../stores/uiStore";

interface ToolExecutionCardProps {
  command?: string;
  result?: unknown;
  status?: "success" | "error" | "pending";
  messageId?: string;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
  command,
  result,
  status = "success",
  messageId,
}) => {
  const [copied, setCopied] = useState(false);
  const selectDomain = useUiStore((state) => state.selectDomain);
  const openInspector = useUiStore((state) => state.openInspector);

  const formattedResult = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result ?? "");

  const handleCopy = () => {
    if (formattedResult) {
      navigator.clipboard.writeText(formattedResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInspect = () => {
    openInspector({
      type: "chatMessage",
      id: messageId || `cmd-${Date.now()}`,
      title: command ? `Command: ${command}` : "Command Execution",
      data: { command, result, status },
    });
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface-subtle)",
        overflow: "hidden",
        margin: "var(--space-2) 0",
        maxWidth: "100%",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-1) var(--space-3)",
          backgroundColor: "var(--color-surface-elevated)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text)" }}>
          <span style={{ color: "var(--color-accent)", display: "flex" }}><TerminalIcon size={14} /></span>
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "var(--font-weight-bold)" }}>
            System Command
          </span>
          {command && (
            <span
              style={{
                color: "var(--color-text)",
                fontWeight: "var(--font-weight-bold)",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              {command}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          {status === "success" && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "10px",
                color: "var(--color-success)",
                fontFamily: "var(--font-sans)",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-success-muted)",
                border: "1px solid var(--color-success)",
              }}
            >
              <CheckCircleIcon size={11} /> Executed
            </span>
          )}
          {status === "error" && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "10px",
                color: "var(--color-danger)",
                fontFamily: "var(--font-sans)",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-danger-muted)",
                border: "1px solid var(--color-danger)",
              }}
            >
              <XCircleIcon size={11} /> Failed
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: "2px 5px",
              borderRadius: "var(--radius-xs)",
              background: "transparent",
              border: "none",
              color: copied ? "var(--color-success)" : "var(--color-text-muted)",
              cursor: "pointer",
            }}
            title="Copy command output"
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
          
          <button
            type="button"
            onClick={handleInspect}
            style={{
              padding: "2px 5px",
              borderRadius: "var(--radius-xs)",
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
            title="Inspect in Details Panel"
          >
            <ExternalLinkIcon size={12} />
          </button>
        </div>
      </div>

      {/* Output Content */}
      {formattedResult && (
        <pre
          style={{
            padding: "var(--space-3)",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "var(--color-text)",
            overflowX: "auto",
            maxHeight: "180px",
            whiteSpace: "pre-wrap",
            userSelect: "text",
            margin: 0,
          }}
        >
          {formattedResult}
        </pre>
      )}

      {/* Navigation action */}
      <div
        style={{
          padding: "var(--space-1) var(--space-3)",
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <span>Execution routed via Fluffy Core & Brain</span>
        <button
          type="button"
          onClick={() => selectDomain("operations")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-accent)",
            cursor: "pointer",
            fontSize: "10px",
            padding: 0,
          }}
        >
          View Operations →
        </button>
      </div>
    </div>
  );
};
