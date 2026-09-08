/**
 * Fluffy Desktop - Sessions View
 * 
 * Conversation memory management view displaying historical chat sessions,
 * message previews, and session cleanup controls.
 */

import React, { useState, useEffect } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useUIStore } from "../../../stores/uiStore";
import { fetchChatSession } from "../../../services/api/memory";
import { SessionCard } from "../components/SessionCard";
import {
  ClockIcon,
  SearchIcon,
  RefreshIcon,
  MessageSquareIcon,
  UserIcon,
  BotIcon,
} from "../../../components/common/Icons";
import type { ChatSessionSummary, ChatSessionDetail } from "../../../types/contracts";

export const SessionsView: React.FC = () => {
  const memory = useMemoryStore();
  const { setInspectorItem } = useUIStore();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<ChatSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  useEffect(() => {
    memory.loadSessions();
    memory.loadActiveSession();
  }, []);

  const filteredSessions = memory.sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.id.toLowerCase().includes(q) || (s.title && s.title.toLowerCase().includes(q));
  });

  const handleSelectSession = async (session: ChatSessionSummary) => {
    setSelectedSessionId(session.id);
    setInspectorItem({
      id: session.id,
      type: "memorySession",
      title: `Session: ${session.title || session.id}`,
      data: session,
    });

    setLoadingDetail(true);
    try {
      const detail = await fetchChatSession(session.id);
      setSessionDetail(detail);
    } catch {
      setSessionDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-3) var(--space-4)",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Search sessions by title or session ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: "32px",
              paddingRight: "12px",
              paddingTop: "6px",
              paddingBottom: "6px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            disabled={memory.loading}
            onClick={() => memory.loadSessions(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-xs)",
              cursor: memory.loading ? "wait" : "pointer",
              opacity: memory.loading ? 0.6 : 1,
            }}
          >
            <RefreshIcon size={12} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2-Column Layout: Session List & Message Inspector Preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        {/* Session List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-1)" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              {filteredSessions.length} sessions
            </span>
          </div>

          {filteredSessions.length === 0 ? (
            <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              No chat memory sessions match the criteria.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "600px", overflowY: "auto" }}>
              {filteredSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isActive={s.id === selectedSessionId || s.id === memory.activeSessionId}
                  onSelect={handleSelectSession}
                  onDelete={async (id) => {
                    await memory.removeSession(id);
                    if (selectedSessionId === id) {
                      setSelectedSessionId(null);
                      setSessionDetail(null);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Message Inspector Preview */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "var(--space-2)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><MessageSquareIcon size={16} /></span>
              <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
                {selectedSessionId ? `Session Messages (${selectedSessionId.slice(0, 10)}...)` : "Select a Session to Preview"}
              </h3>
            </div>
          </div>

          {!selectedSessionId ? (
            <div style={{ padding: "var(--space-8) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)" }}>
              <ClockIcon size={24} />
              <span>Click on any session in the list to inspect historical conversation memory.</span>
            </div>
          ) : loadingDetail ? (
            <div style={{ padding: "var(--space-8) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              Loading session transcript...
            </div>
          ) : !sessionDetail?.messages || sessionDetail.messages.length === 0 ? (
            <div style={{ padding: "var(--space-8) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              No message logs found for this session.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "520px", overflowY: "auto", paddingRight: "var(--space-1)" }}>
              {sessionDetail.messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id || idx}
                    style={{
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "var(--font-size-xs)",
                      backgroundColor: isUser ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
                      border: `1px solid ${isUser ? "var(--color-accent-border)" : "var(--color-border-subtle)"}`,
                      color: "var(--color-text)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ color: isUser ? "var(--color-accent)" : "var(--color-text-muted)", display: "flex" }}>
                          {isUser ? <UserIcon size={12} /> : <BotIcon size={12} />}
                        </span>
                        <span style={{ textTransform: "capitalize", fontWeight: "var(--font-weight-bold)" }}>{msg.role}</span>
                      </div>
                      {msg.timestamp && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>
                      {msg.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
