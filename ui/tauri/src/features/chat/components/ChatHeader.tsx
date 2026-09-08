/**
 * Fluffy Desktop - ChatHeader Component
 * 
 * Top bar for the Chat domain providing session status, sub-navigation tabs,
 * voice control toggles (STT / TTS Mute), and session action controls.
 */

import React from "react";
import { useUiStore } from "../../../stores/uiStore";
import { useChatStore } from "../../../stores/chatStore";
import { ChatSection } from "../../../types/ui";
import {
  MessageSquareIcon,
  HistoryIcon,
  LayersIcon,
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VolumeXIcon,
  PlusIcon,
  TrashIcon,
} from "../../../components/common/Icons";

export const ChatHeader: React.FC = () => {
  const chatSection = useUiStore((state) => state.chatSection);
  const selectChatSection = useUiStore((state) => state.selectChatSection);

  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const isListening = useChatStore((state) => state.isListening);
  const isTtsMuted = useChatStore((state) => state.isTtsMuted);
  const isSpeaking = useChatStore((state) => state.isSpeaking);
  const newSession = useChatStore((state) => state.newSession);
  const clearCurrentMessages = useChatStore((state) => state.clearCurrentMessages);
  const toggleTtsMute = useChatStore((state) => state.toggleTtsMute);
  const startVoiceInput = useChatStore((state) => state.startVoiceInput);
  const stopVoiceInput = useChatStore((state) => state.stopVoiceInput);

  const tabs: { id: ChatSection; label: string; icon: React.ReactNode }[] = [
    { id: "conversation", label: "Conversation", icon: <MessageSquareIcon size={14} /> },
    { id: "sessions", label: "Sessions", icon: <HistoryIcon size={14} /> },
    { id: "context", label: "Context", icon: <LayersIcon size={14} /> },
    { id: "voice", label: "Voice Controls", icon: <MicIcon size={14} /> },
  ];

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        padding: "var(--space-2) var(--space-4)",
        gap: "var(--space-3)",
        userSelect: "none",
        flexWrap: "wrap",
        minHeight: "44px",
      }}
    >
      {/* Domain info & Sub-tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div
            style={{
              padding: "var(--space-1) var(--space-2)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageSquareIcon size={15} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <h1
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <span>Fluffy Brain</span>
              {activeSessionId && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: "var(--color-surface-elevated)",
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-mono)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                >
                  {activeSessionId.length > 12 ? `${activeSessionId.slice(0, 10)}...` : activeSessionId}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div style={{ width: "1px", height: "16px", backgroundColor: "var(--color-border)", margin: "0 2px" }} />

        {/* Navigation Tabs */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            backgroundColor: "var(--color-surface-subtle)",
            padding: "2px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          {tabs.map((tab) => {
            const isActive = chatSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectChatSection(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: isActive ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
                  borderRadius: "var(--radius-sm)",
                  border: isActive ? "1px solid var(--color-border)" : "1px solid transparent",
                  backgroundColor: isActive ? "var(--color-surface-elevated)" : "transparent",
                  color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
                  cursor: "pointer",
                  transition: "var(--transition-fast)",
                }}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {/* Speech indicator / Voice Toggle */}
        <button
          type="button"
          onClick={() => (isListening ? stopVoiceInput() : startVoiceInput())}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            padding: "var(--space-1) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-medium)",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${isListening ? "var(--color-danger)" : "var(--color-border)"}`,
            backgroundColor: isListening ? "var(--color-danger-muted)" : "var(--color-surface-elevated)",
            color: isListening ? "var(--color-danger)" : "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "var(--transition-fast)",
          }}
          title={isListening ? "Listening... Click to stop" : "Start Voice Input (STT)"}
        >
          {isListening ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
          <span>{isListening ? "Listening..." : "Voice Input"}</span>
        </button>

        {/* TTS Mute Toggle */}
        <button
          type="button"
          onClick={() => toggleTtsMute()}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${isTtsMuted ? "var(--color-warning)" : "var(--color-border)"}`,
            backgroundColor: isTtsMuted ? "var(--color-warning-muted)" : "var(--color-surface-elevated)",
            color: isTtsMuted ? "var(--color-warning)" : (isSpeaking ? "var(--color-accent)" : "var(--color-text-secondary)"),
            cursor: "pointer",
            transition: "var(--transition-fast)",
          }}
          title={isTtsMuted ? "TTS Audio is Muted" : isSpeaking ? "Fluffy is speaking..." : "TTS Audio Active"}
        >
          {isTtsMuted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
        </button>

        {/* Clear Messages */}
        <button
          type="button"
          onClick={() => clearCurrentMessages()}
          disabled={isStreaming}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-elevated)",
            color: "var(--color-text-muted)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            opacity: isStreaming ? 0.5 : 1,
            transition: "var(--transition-fast)",
          }}
          title="Clear current view messages"
        >
          <TrashIcon size={14} />
        </button>

        {/* New Session Button */}
        <button
          type="button"
          onClick={() => newSession()}
          disabled={isStreaming}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            padding: "var(--space-1) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-bold)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-accent)",
            backgroundColor: "var(--color-accent)",
            color: "#ffffff",
            cursor: isStreaming ? "not-allowed" : "pointer",
            opacity: isStreaming ? 0.5 : 1,
            boxShadow: "var(--shadow-sm)",
            transition: "var(--transition-fast)",
          }}
        >
          <PlusIcon size={13} />
          <span>New Session</span>
        </button>
      </div>
    </header>
  );
};
