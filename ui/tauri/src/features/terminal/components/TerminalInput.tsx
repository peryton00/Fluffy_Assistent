/**
 * Fluffy Desktop - Terminal Input Component
 * 
 * Interactive command-line prompt.
 * Supports Enter submit, ArrowUp/ArrowDown command history traversal, and Ctrl+L clear.
 */

import React, { useState, useRef, useEffect } from "react";
import { useTerminalStore, terminalStore } from "../../../stores/terminalStore";
import { SendIcon } from "../../../components/common/Icons";

export const TerminalInput: React.FC = () => {
  const prompt = useTerminalStore((s) => s.prompt);
  const connectionState = useTerminalStore((s) => s.connectionState);
  const isConnected = connectionState === "connected";

  const [input, setInput] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount and reconnection
  useEffect(() => {
    if (isConnected) {
      inputRef.current?.focus();
    }
  }, [isConnected]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    terminalStore.sendCommand(trimmed);
    setInput("");
    terminalStore.resetHistoryIndex();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+L -> Clear terminal output
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      terminalStore.clearOutput();
      return;
    }

    // Ctrl+C -> Send break or interrupt
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      if (input.trim()) {
        setInput("");
        terminalStore.resetHistoryIndex();
      }
      return;
    }

    // History traversal
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevCmd = terminalStore.navigateHistory("up", input);
      setInput(prevCmd);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextCmd = terminalStore.navigateHistory("down", input);
      setInput(nextCmd);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      {/* Prompt Prefix */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)", userSelect: "none", flexShrink: 0 }}>
        <span>{prompt || "fluffy> "}</span>
      </div>

      {/* Input Field */}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!isConnected}
        placeholder={
          isConnected
            ? "Enter Core REPL command (e.g. status, list, rolecall, help)..."
            : "Terminal offline — waiting for Core connection on ws://127.0.0.1:9003..."
        }
        style={{
          flex: 1,
          backgroundColor: "transparent",
          border: "none",
          color: "var(--color-text)",
          fontSize: "var(--font-size-xs)",
          fontFamily: "var(--font-mono)",
          outline: "none",
          opacity: isConnected ? 1 : 0.6,
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />

      {/* Submit Button / Shortcut indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", userSelect: "none" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "2px 6px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
          }}
        >
          <kbd>Ctrl</kbd>+<kbd>L</kbd> clear
        </span>
        <button
          type="submit"
          disabled={!isConnected || !input.trim()}
          style={{
            padding: "6px 10px",
            backgroundColor: isConnected && input.trim() ? "var(--color-accent)" : "var(--color-surface-elevated)",
            color: isConnected && input.trim() ? "#ffffff" : "var(--color-text-muted)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
            fontSize: "11px",
            fontWeight: "var(--font-weight-bold)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: isConnected && input.trim() ? "pointer" : "not-allowed",
          }}
          title="Submit command (Enter)"
        >
          <SendIcon size={12} />
        </button>
      </div>
    </form>
  );
};
