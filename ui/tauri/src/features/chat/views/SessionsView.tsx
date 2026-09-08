/**
 * Fluffy Desktop - SessionsView Component
 * 
 * Session manager allowing inspection, switching, creating, and deleting
 * conversational history stored in the Python Brain.
 */

import React, { useEffect, useState } from "react";
import { ChatHeader } from "../components/ChatHeader";
import { useChatStore } from "../../../stores/chatStore";
import { useUiStore } from "../../../stores/uiStore";
import { 
  HistoryIcon, 
  PlusIcon, 
  TrashIcon, 
  ClockIcon, 
  ArrowRightIcon
} from "../../../components/common/Icons";

export const SessionsView: React.FC = () => {
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const switchSession = useChatStore((state) => state.switchSession);
  const newSession = useChatStore((state) => state.newSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const selectChatSection = useUiStore((state) => state.selectChatSection);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(activeSessionId || null);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId && !selectedSessionId) {
      setSelectedSessionId(activeSessionId);
    }
  }, [activeSessionId, selectedSessionId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];

  const handleOpenConversation = (sessionId: string) => {
    switchSession(sessionId);
    selectChatSection("conversation");
  };

  const formatDate = (val?: string | number) => {
    if (!val) return "Recent";
    try {
      return new Date(val).toLocaleDateString();
    } catch {
      return "Recent";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      <ChatHeader />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 340px) 1fr",
          borderTop: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        {/* Left Column: Sessions List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
            backgroundColor: "var(--color-surface)",
            borderRight: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "var(--space-3)",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><HistoryIcon size={14} /></span>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                Chat Sessions
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {sessions.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => newSession()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "var(--space-1) var(--space-2)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-accent)",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
              }}
            >
              <PlusIcon size={12} />
              <span>New</span>
            </button>
          </div>

          {/* Session List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {sessions.length === 0 ? (
              <div style={{ padding: "var(--space-6)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                No stored chat sessions found.
              </div>
            ) : (
              sessions.map((session) => {
                const isCurrentActive = session.id === activeSessionId;
                const isSelected = session.id === (selectedSession?.id ?? "");

                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
                      backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface-subtle)",
                      cursor: "pointer",
                      transition: "var(--transition-fast)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: isSelected ? "var(--font-weight-bold)" : "var(--font-weight-medium)", color: "var(--color-text)" }}>
                        {session.title || "Untitled Session"}
                      </span>
                      {isCurrentActive && (
                        <span
                          style={{
                            fontSize: "9px",
                            padding: "1px 5px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: "var(--color-success-muted)",
                            color: "var(--color-success-text)",
                            fontWeight: "var(--font-weight-bold)",
                          }}
                        >
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-muted)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <ClockIcon size={10} />
                        {formatDate((session.updated_at as string | number | undefined) || (session.created_at as string | number | undefined))}
                      </span>
                      <span>{session.message_count || 0} messages</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Session Detail / Preview */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, backgroundColor: "var(--color-bg)", overflow: "hidden" }}>
          {selectedSession ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              {/* Detail Header */}
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                    {selectedSession.title || "Session Detail"}
                  </h2>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0 0", fontFamily: "var(--font-mono)" }}>
                    ID: {selectedSession.id}
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    onClick={() => handleOpenConversation(selectedSession.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-1)",
                      padding: "var(--space-1) var(--space-3)",
                      fontSize: "var(--font-size-xs)",
                      fontWeight: "var(--font-weight-bold)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--color-accent)",
                      color: "#ffffff",
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <span>Open Conversation</span>
                    <ArrowRightIcon size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteSession(selectedSession.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "var(--font-size-xs)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-danger)",
                      backgroundColor: "var(--color-danger-muted)",
                      color: "var(--color-danger)",
                      cursor: "pointer",
                    }}
                    title="Delete session"
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>

              {/* Messages Preview */}
              <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)", letterSpacing: "0.5px" }}>
                  Message History
                </span>
                {Array.isArray(selectedSession.messages) && selectedSession.messages.length > 0 ? (
                  (selectedSession.messages as Array<{ role: string; content: string }>).map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border-subtle)",
                        backgroundColor: m.role === "assistant" ? "var(--color-surface)" : "var(--color-surface-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span style={{ fontSize: "10px", fontWeight: "var(--font-weight-bold)", color: m.role === "assistant" ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                          {m.role.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {m.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "var(--space-6)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                    No messages cached in this session preview.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              Select a session to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
