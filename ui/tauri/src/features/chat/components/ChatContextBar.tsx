/**
 * Fluffy Desktop - ChatContextBar Component
 * 
 * Contextual status bar positioned above the composer, displaying the live
 * Brain execution environment: Active Session, Security Layer, Memory Context,
 * and Voice state.
 */

import React from "react";
import { useChatStore } from "../../../stores/chatStore";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useUiStore } from "../../../stores/uiStore";
import { 
  ShieldIcon, 
  DatabaseIcon, 
  CpuIcon, 
  SparklesIcon, 
  MicIcon, 
  Volume2Icon 
} from "../../../components/common/Icons";

export const ChatContextBar: React.FC = () => {
  const useVoiceFeedback = useChatStore((state) => state.useVoiceFeedback);
  const isListening = useChatStore((state) => state.isListening);
  const partialTranscript = useChatStore((state) => state.partialTranscript);
  const finalTranscript = useChatStore((state) => state.finalTranscript);
  
  const snapshot = useTelemetryStore((state) => state.snapshot);
  const memoryState = useMemoryStore();
  
  const selectDomain = useUiStore((state) => state.selectDomain);
  const selectGuardianSection = useUiStore((state) => state.selectGuardianSection);
  const selectMemorySection = useUiStore((state) => state.selectMemorySection);

  const guardianMode = snapshot?.status || "Active";
  const pendingApprovalsCount = snapshot?.pending_confirmations?.length ?? 0;
  const memorySessionsCount = memoryState.sessions?.length ?? 0;
  const memoryProfile = memoryState.profile;
  const factsCount = memoryProfile?.facts?.length ?? memoryState.memory?.facts?.length ?? 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-1) var(--space-4)",
        backgroundColor: "var(--color-surface-subtle)",
        borderTop: "1px solid var(--color-border-subtle)",
        fontSize: "11px",
        color: "var(--color-text-muted)",
        userSelect: "none",
        gap: "var(--space-2)",
        flexWrap: "wrap",
      }}
    >
      {/* Left side: Environment info */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", overflowX: "auto" }}>
        {/* Execution Target */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", color: "var(--color-text-secondary)", fontWeight: "var(--font-weight-medium)" }}>
          <span style={{ color: "var(--color-accent)", display: "flex" }}><CpuIcon size={13} /></span>
          <span>Local Brain</span>
          <span
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              padding: "1px 5px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            127.0.0.1:5123
          </span>
        </div>

        {/* Guardian Status Indicator */}
        <button
          type="button"
          onClick={() => {
            selectDomain("guardian");
            if (pendingApprovalsCount > 0) {
              selectGuardianSection("approvals");
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            background: "transparent",
            border: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "11px",
            padding: "2px 4px",
            borderRadius: "var(--radius-xs)",
          }}
          title="Click to view Guardian policies & approvals"
        >
          <span style={{ color: pendingApprovalsCount > 0 ? "var(--color-warning)" : "var(--color-success)", display: "flex" }}>
            <ShieldIcon size={13} />
          </span>
          <span style={{ textTransform: "capitalize" }}>{guardianMode}</span>
          {pendingApprovalsCount > 0 && (
            <span
              style={{
                padding: "1px 5px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-warning-muted)",
                color: "var(--color-warning-text)",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              {pendingApprovalsCount} pending
            </span>
          )}
        </button>

        {/* Memory Context Indicator */}
        <button
          type="button"
          onClick={() => {
            selectDomain("memory");
            selectMemorySection("profile");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            background: "transparent",
            border: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "11px",
            padding: "2px 4px",
            borderRadius: "var(--radius-xs)",
          }}
          title="Click to view Memory profile & stored facts"
        >
          <span style={{ color: "var(--color-info)", display: "flex" }}><DatabaseIcon size={13} /></span>
          <span>{factsCount > 0 ? `${factsCount} facts` : `${memorySessionsCount} sessions`}</span>
        </button>
      </div>

      {/* Right side: Live STT transcript or voice mode */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {isListening ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              color: "var(--color-danger)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
            }}
          >
            <MicIcon size={12} />
            <span style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {partialTranscript || finalTranscript || "Listening for speech..."}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "10px" }}>
            {useVoiceFeedback && (
              <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--color-accent)" }}>
                <Volume2Icon size={12} />
                <span>Voice replies</span>
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--color-success)" }}>
              <SparklesIcon size={12} />
              <span>Streaming Enabled</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
