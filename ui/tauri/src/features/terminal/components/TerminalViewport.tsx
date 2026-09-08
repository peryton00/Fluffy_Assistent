/**
 * Fluffy Desktop - Terminal Viewport Component
 * 
 * High-performance, safe monospace terminal output viewer.
 * Bounded buffer rendering, semantic color tag mapping, and smart autoscroll.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTerminalStore } from "../../../stores/terminalStore";
import { ArrowDownIcon, TerminalIcon, ShieldAlertIcon } from "../../../components/common/Icons";
import type { TerminalOutputLine } from "../../../stores/terminalStore";

export interface TerminalViewportProps {
  filterQuery?: string;
  onSelectLine?: (line: TerminalOutputLine) => void;
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({
  filterQuery = "",
  onSelectLine,
}) => {
  const outputLines = useTerminalStore((s) => s.outputLines);
  const connectionState = useTerminalStore((s) => s.connectionState);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollLockedRef = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);

  // Filter lines if query provided
  const visibleLines = filterQuery.trim()
    ? outputLines.filter(
        (l) =>
          l.text.toLowerCase().includes(filterQuery.toLowerCase()) ||
          l.tag.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : outputLines;

  // Handle user scroll interactions
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Tolerance of 25px from bottom
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 25;
    isAutoScrollLockedRef.current = isAtBottom;
    setShowScrollBottomBtn(!isAtBottom);
  }, []);

  // Follow new output if autoscroll lock is active
  useEffect(() => {
    if (isAutoScrollLockedRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleLines]);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      isAutoScrollLockedRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  const getColorStyle = (colorTag: string): React.CSSProperties => {
    switch (colorTag.toLowerCase()) {
      case "success":
        return { color: "var(--color-success)" };
      case "error":
        return { color: "var(--color-danger)" };
      case "warning":
      case "warn":
        return { color: "var(--color-warning)" };
      case "brand":
        return { color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)" };
      case "dim":
        return { color: "var(--color-text-muted)" };
      case "text":
      default:
        return { color: "var(--color-text)" };
    }
  };

  const getTagBadgeStyle = (tag: string): React.CSSProperties => {
    switch (tag.toLowerCase()) {
      case "system":
        return {
          backgroundColor: "var(--color-surface-elevated)",
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
        };
      case "core":
      case "repl":
        return {
          backgroundColor: "var(--color-accent-subtle)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent-border)",
        };
      case "guardian":
        return {
          backgroundColor: "var(--color-warning-subtle)",
          color: "var(--color-warning)",
          border: "1px solid var(--color-warning-border)",
        };
      default:
        return {
          backgroundColor: "var(--color-surface-elevated)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border-subtle)",
        };
    }
  };

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        backgroundColor: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      {/* Scrollable Output Canvas */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="Terminal Output"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          outline: "none",
          userSelect: "text",
        }}
      >
        {visibleLines.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "var(--space-8)",
              color: "var(--color-text-muted)",
              userSelect: "none",
            }}
          >
            {connectionState === "connected" ? (
              <>
                <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
                  <TerminalIcon size={32} />
                </div>
                <p style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                  Core Terminal Ready
                </p>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "4px", maxWidth: "380px" }}>
                  Interactive session connected to <code>ws://127.0.0.1:9003</code>. Enter commands below or type <code>help</code> for options.
                </p>
              </>
            ) : connectionState === "reconnecting" || connectionState === "connecting" ? (
              <>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid var(--color-accent)", borderTopColor: "transparent", marginBottom: "var(--space-3)" }} />
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", margin: 0 }}>Connecting to Fluffy Core...</p>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "4px" }}>Establishing full-duplex WebSocket stream on ws://127.0.0.1:9003.</p>
              </>
            ) : (
              <>
                <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
                  <ShieldAlertIcon size={32} />
                </div>
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", margin: 0 }}>Terminal Disconnected</p>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Core REPL server is not running on port 9003. Click <strong>Reconnect</strong> in the header to retry.
                </p>
              </>
            )}
          </div>
        ) : (
          visibleLines.map((line) => (
            <div
              key={line.id}
              onClick={() => onSelectLine?.(line)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-2)",
                padding: "2px 4px",
                borderRadius: "var(--radius-xs)",
                lineHeight: 1.5,
                cursor: onSelectLine ? "pointer" : "default",
              }}
            >
              {/* Timestamp */}
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", flexShrink: 0, userSelect: "none", paddingTop: "1px" }}>
                {line.timestamp}
              </span>

              {/* Tag / Sender */}
              {line.tag && (
                <span
                  style={{
                    fontSize: "9px",
                    textTransform: "uppercase",
                    fontWeight: "var(--font-weight-bold)",
                    padding: "1px 5px",
                    borderRadius: "var(--radius-xs)",
                    flexShrink: 0,
                    userSelect: "none",
                    ...getTagBadgeStyle(line.tag),
                  }}
                >
                  {line.tag}
                </span>
              )}

              {/* Message Content */}
              <span
                style={{
                  flex: 1,
                  wordBreak: "break-all",
                  whiteSpace: "pre-wrap",
                  ...getColorStyle(line.color_tag),
                }}
              >
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Floating Jump to Latest Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            bottom: "12px",
            right: "20px",
            padding: "6px 12px",
            backgroundColor: "var(--color-accent)",
            color: "#ffffff",
            borderRadius: "var(--radius-sm)",
            border: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontSize: "11px",
            fontWeight: "var(--font-weight-bold)",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            cursor: "pointer",
          }}
        >
          <ArrowDownIcon size={13} />
          Jump to latest
        </button>
      )}
    </div>
  );
};
