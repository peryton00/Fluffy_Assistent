/**
 * Fluffy Desktop - MessageBubble Component
 * 
 * Renders individual user, assistant, system, command, or error messages
 * in the conversation stream with full inspection, copy, and TTS actions.
 */

import React, { useState } from "react";
import { ChatMessage } from "../../../types/contracts";
import { ToolExecutionCard } from "./ToolExecutionCard";
import { ApprovalRequestCard } from "./ApprovalRequestCard";
import { useChatStore } from "../../../stores/chatStore";
import { useUiStore } from "../../../stores/uiStore";
import { 
  UserIcon, 
  SparklesIcon, 
  AlertTriangleIcon, 
  TerminalIcon, 
  CopyIcon, 
  CheckIcon, 
  Volume2Icon, 
  InfoIcon,
  RotateCcwIcon
} from "../../../components/common/Icons";

interface MessageBubbleProps {
  message: ChatMessage;
  isLast?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isLast = false }) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const speak = useChatStore((state) => state.speak);
  const retryLastMessage = useChatStore((state) => state.retryLastMessage);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const openInspector = useUiStore((state) => state.openInspector);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const isCommand = message.role === "command";
  const isError = message.role === "error";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInspect = () => {
    openInspector({
      type: "chatMessage",
      id: message.id || `msg-${message.timestamp || Date.now()}`,
      title: `${message.role.toUpperCase()}: ${message.content.slice(0, 30)}...`,
      data: {
        id: message.id || `msg-${message.timestamp || Date.now()}`,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata,
      },
    });
  };

  const handleSpeak = () => {
    if (message.content) {
      speak(message.content);
    }
  };

  const formattedTime = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  const isApprovalReq =
    (message.metadata && (message.metadata as unknown as Record<string, unknown>).requiresApproval) ||
    message.content.toLowerCase().includes("requires guardian approval");

  let bgColor = "transparent";
  let borderColor = "transparent";

  if (isAssistant) {
    bgColor = "var(--color-surface)";
    borderColor = "var(--color-border-subtle)";
  } else if (isError) {
    bgColor = "var(--color-danger-muted)";
    borderColor = "var(--color-danger)";
  } else if (isCommand || isSystem) {
    bgColor = "var(--color-surface-subtle)";
    borderColor = "var(--color-border-subtle)";
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        transition: "var(--transition-fast)",
      }}
    >
      {/* Role Avatar */}
      <div style={{ flexShrink: 0, marginTop: "2px", userSelect: "none" }}>
        {isUser && (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserIcon size={14} />
          </div>
        )}
        {isAssistant && (
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
            <SparklesIcon size={14} />
          </div>
        )}
        {isCommand && (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-success-muted)",
              color: "var(--color-success-text)",
              border: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TerminalIcon size={14} />
          </div>
        )}
        {isSystem && (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-info-muted)",
              color: "var(--color-info)",
              border: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <InfoIcon size={14} />
          </div>
        )}
        {isError && (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-danger-muted)",
              color: "var(--color-danger-text)",
              border: "1px solid var(--color-danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangleIcon size={14} />
          </div>
        )}
      </div>

      {/* Message Body */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {/* Header (Role + Timestamp + Actions) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
              {isUser ? "Operator" : isAssistant ? "Fluffy Brain" : isCommand ? "System" : isSystem ? "System Event" : "Error"}
            </span>
            {formattedTime && (
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                {formattedTime}
              </span>
            )}
            {message.metadata?.tool ? (
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
                tool: {String(message.metadata.tool)}
              </span>
            ) : null}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              opacity: isHovered ? 1 : 0,
              transition: "var(--transition-fast)",
            }}
          >
            {isAssistant && (
              <button
                type="button"
                onClick={handleSpeak}
                style={{
                  padding: "2px 5px",
                  borderRadius: "var(--radius-xs)",
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                }}
                title="Read aloud with TTS"
              >
                <Volume2Icon size={13} />
              </button>
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
              title="Copy text"
            >
              {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
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
              title="Inspect message metadata"
            >
              <InfoIcon size={13} />
            </button>
            {isError && isLast && (
              <button
                type="button"
                onClick={() => retryLastMessage()}
                disabled={isStreaming}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "10px",
                  color: "var(--color-danger)",
                  backgroundColor: "var(--color-danger-muted)",
                  border: "1px solid var(--color-danger)",
                  cursor: "pointer",
                }}
                title="Retry prompt"
              >
                <RotateCcwIcon size={11} />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>

        {/* Message Content */}
        {isApprovalReq ? (
          <ApprovalRequestCard
            actionName={message.metadata?.tool ? String(message.metadata.tool) : "Privileged Operation"}
            reason={message.content}
          />
        ) : isCommand ? (
          <ToolExecutionCard
            command={typeof message.metadata?.command === "string" ? message.metadata.command : undefined}
            result={message.metadata?.result ?? message.command_result ?? message.content}
            status={isError ? "error" : "success"}
            messageId={message.id}
          />
        ) : (
          <div
            style={{
              fontSize: isError ? "var(--font-size-xs)" : "var(--font-size-sm)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              userSelect: "text",
              color: isError ? "var(--color-danger-text)" : "var(--color-text)",
              fontFamily: isError ? "var(--font-mono)" : "var(--font-sans)",
            }}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
};
