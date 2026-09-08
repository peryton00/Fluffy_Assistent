/**
 * Fluffy Desktop - StreamingMessage Component
 * 
 * Renders the live in-flight LLM stream response with progressive text rendering,
 * blinking cursor, and streaming controls.
 */

import React from "react";
import { SparklesIcon, SquareIcon, Volume2Icon } from "../../../components/common/Icons";
import { useChatStore } from "../../../stores/chatStore";

export const StreamingMessage: React.FC = () => {
  const streamingMessage = useChatStore((state) => state.streamingMessage);
  const stopGeneration = useChatStore((state) => state.stopGeneration);
  const isSpeaking = useChatStore((state) => state.isSpeaking);

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* Assistant Avatar */}
      <div style={{ flexShrink: 0, marginTop: "2px", userSelect: "none" }}>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
            border: "1px solid var(--color-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SparklesIcon size={15} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
              Fluffy Brain
            </span>
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
                fontFamily: "var(--font-mono)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Generating...
            </span>
            {isSpeaking && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-warning-muted)",
                  color: "var(--color-warning-text)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Volume2Icon size={11} />
                Speaking
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => stopGeneration()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-danger)",
              backgroundColor: "var(--color-danger-muted)",
              color: "var(--color-danger)",
              cursor: "pointer",
            }}
            title="Stop response generation"
          >
            <SquareIcon size={10} style={{ fill: "currentColor" }} />
            <span>Stop</span>
          </button>
        </div>

        <div
          style={{
            fontSize: "var(--font-size-sm)",
            lineHeight: 1.6,
            color: "var(--color-text)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            userSelect: "text",
          }}
        >
          {streamingMessage || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: "var(--font-size-xs)" }}>Thinking...</span>}
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "14px",
              marginLeft: "4px",
              backgroundColor: "var(--color-accent)",
              verticalAlign: "middle",
            }}
          />
        </div>
      </div>
    </div>
  );
};
