/**
 * Fluffy Desktop - MessageList Component
 * 
 * Scrollable container for the conversation stream. Features smart auto-scrolling,
 * empty state with operational prompt starters, and active streaming indicators.
 */

import React, { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../../stores/chatStore";
import { MessageBubble } from "./MessageBubble";
import { StreamingMessage } from "./StreamingMessage";
import { 
  SparklesIcon, 
  CpuIcon, 
  ShieldIcon, 
  DatabaseIcon, 
  TerminalIcon, 
  ArrowDownIcon 
} from "../../../components/common/Icons";

export const MessageList: React.FC = () => {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const sendMessage = useChatStore((state) => state.sendMessage);

  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setUserHasScrolledUp(distanceFromBottom > 80);
  };

  useEffect(() => {
    if (!userHasScrolledUp) {
      scrollToBottom(isStreaming ? "auto" : "smooth");
    }
  }, [messages, isStreaming, userHasScrolledUp]);

  const quickPrompts = [
    { label: "Check System Health", icon: <CpuIcon size={14} />, color: "var(--color-accent)", prompt: "What is my current system resource usage?" },
    { label: "List Top Processes", icon: <TerminalIcon size={14} />, color: "var(--color-success)", prompt: "List the top processes consuming memory and CPU." },
    { label: "Guardian Status", icon: <ShieldIcon size={14} />, color: "var(--color-warning)", prompt: "Check Guardian security mode and pending approvals." },
    { label: "Memory Facts", icon: <DatabaseIcon size={14} />, color: "var(--color-info)", prompt: "Summarize what you remember about my setup from long-term memory." },
  ];

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 && !isStreaming ? (
          <div
            style={{
              height: "100%",
              minHeight: "320px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-6)",
              textAlign: "center",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "var(--space-4)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <SparklesIcon size={24} />
            </div>

            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Fluffy Conversational Assistant
            </h2>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text-muted)",
                maxWidth: "440px",
                marginTop: "var(--space-2)",
                lineHeight: 1.6,
              }}
            >
              Real-time operational control via local LLM and speech pipeline. Ask questions, query system metrics, or trigger automated workflows.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--space-2)",
                marginTop: "var(--space-6)",
                maxWidth: "500px",
                width: "100%",
              }}
            >
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendMessage(item.prompt)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "var(--font-size-xs)",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <div
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      color: item.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.icon}
                  </div>
                  <span style={{ fontWeight: "var(--font-weight-medium)" }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ paddingBottom: "var(--space-4)" }}>
            {messages.map((msg, index) => (
              <MessageBubble
                key={msg.id || index}
                message={msg}
                isLast={index === messages.length - 1}
              />
            ))}
            {isStreaming && <StreamingMessage />}
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {userHasScrolledUp && (
        <button
          type="button"
          onClick={() => {
            setUserHasScrolledUp(false);
            scrollToBottom("smooth");
          }}
          style={{
            position: "absolute",
            bottom: "16px",
            right: "20px",
            padding: "8px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--color-accent)",
            color: "#ffffff",
            boxShadow: "var(--shadow-md)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "var(--transition-fast)",
          }}
          title="Scroll to latest messages"
        >
          <ArrowDownIcon size={16} />
        </button>
      )}
    </div>
  );
};
