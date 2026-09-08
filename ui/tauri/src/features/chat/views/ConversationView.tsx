/**
 * Fluffy Desktop - ConversationView Component
 * 
 * Main conversational interface combining the header, scrollable message list,
 * live context bar, and interactive composer.
 */

import React, { useEffect } from "react";
import { ChatHeader } from "../components/ChatHeader";
import { MessageList } from "../components/MessageList";
import { ChatContextBar } from "../components/ChatContextBar";
import { ChatComposer } from "../components/ChatComposer";
import { useChatStore } from "../../../stores/chatStore";

export const ConversationView: React.FC = () => {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const loadSessionMessages = useChatStore((state) => state.loadSessionMessages);

  // Initialize sessions on first mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load messages when active session changes if empty
  useEffect(() => {
    if (activeSessionId) {
      loadSessionMessages(activeSessionId);
    }
  }, [activeSessionId, loadSessionMessages]);

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
      <MessageList />
      <ChatContextBar />
      <ChatComposer />
    </div>
  );
};
