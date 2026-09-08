/**
 * Fluffy Desktop - ChatComposer Component
 * 
 * Multiline input composer supporting keyboard shortcuts (Enter / Shift+Enter),
 * local Vosk speech-to-text triggering, TTS voice reply toggle, and streaming abort.
 */

import React, { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../../stores/chatStore";
import { 
  SendIcon, 
  SquareIcon, 
  MicIcon, 
  MicOffIcon, 
  Volume2Icon, 
  VolumeXIcon 
} from "../../../components/common/Icons";

export const ChatComposer: React.FC = () => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useChatStore((state) => state.isStreaming);
  const isListening = useChatStore((state) => state.isListening);
  const useVoiceFeedback = useChatStore((state) => state.useVoiceFeedback);
  const finalTranscript = useChatStore((state) => state.finalTranscript);
  const partialTranscript = useChatStore((state) => state.partialTranscript);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stopGeneration = useChatStore((state) => state.stopGeneration);
  const startVoiceInput = useChatStore((state) => state.startVoiceInput);
  const stopVoiceInput = useChatStore((state) => state.stopVoiceInput);
  const toggleVoiceFeedback = useChatStore((state) => state.toggleVoiceFeedback);

  // Auto-fill from STT transcript if received
  useEffect(() => {
    if (finalTranscript) {
      setInput((prev) => (prev ? `${prev} ${finalTranscript}` : finalTranscript));
    }
  }, [finalTranscript]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  return (
    <div
      style={{
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-strong)",
          backgroundColor: "var(--color-surface-elevated)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        {/* Live Speech Feedback Banner */}
        {isListening && (
          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              backgroundColor: "var(--color-danger-muted)",
              borderBottom: "1px solid var(--color-danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              color: "var(--color-danger)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", overflow: "hidden" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-danger)",
                }}
              />
              <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>Listening:</span>
              <span style={{ fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {partialTranscript || "Speak into microphone..."}
              </span>
            </div>
            <button
              type="button"
              onClick={stopVoiceInput}
              style={{
                padding: "2px 8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-danger)",
                color: "#ffffff",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Stop STT
            </button>
          </div>
        )}

        {/* Text input area */}
        <div style={{ padding: "var(--space-2)", display: "flex", alignItems: "flex-end", gap: "var(--space-2)" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening to voice input..." : "Ask Fluffy, run system tasks, inspect logs... (Enter to send, Shift+Enter for newline)"}
            rows={1}
            disabled={isStreaming}
            style={{
              flex: 1,
              maxHeight: "160px",
              minHeight: "36px",
              resize: "none",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              fontSize: "var(--font-size-sm)",
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
              padding: "var(--space-1) var(--space-2)",
              lineHeight: 1.5,
              userSelect: "text",
              opacity: isStreaming ? 0.6 : 1,
            }}
          />

          {/* Action buttons inside input box */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", paddingBottom: "2px" }}>
            {/* Voice feedback toggle */}
            <button
              type="button"
              onClick={toggleVoiceFeedback}
              style={{
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid",
                borderColor: useVoiceFeedback ? "var(--color-accent)" : "transparent",
                backgroundColor: useVoiceFeedback ? "var(--color-accent-muted)" : "transparent",
                color: useVoiceFeedback ? "var(--color-accent)" : "var(--color-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "var(--transition-fast)",
              }}
              title={useVoiceFeedback ? "Voice audio responses enabled" : "Voice audio responses disabled"}
            >
              {useVoiceFeedback ? <Volume2Icon size={15} /> : <VolumeXIcon size={15} />}
            </button>

            {/* STT Mic toggle */}
            <button
              type="button"
              onClick={handleMicClick}
              style={{
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid",
                borderColor: isListening ? "var(--color-danger)" : "transparent",
                backgroundColor: isListening ? "var(--color-danger-muted)" : "transparent",
                color: isListening ? "var(--color-danger)" : "var(--color-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "var(--transition-fast)",
              }}
              title={isListening ? "Stop Voice Input" : "Start Voice Input (STT)"}
            >
              {isListening ? <MicIcon size={15} /> : <MicOffIcon size={15} />}
            </button>

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-danger)",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-sm)",
                  transition: "var(--transition-fast)",
                  height: "30px",
                }}
                title="Stop generation"
              >
                <SquareIcon size={12} style={{ fill: "currentColor" }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-accent)",
                  color: "#ffffff",
                  border: "none",
                  cursor: !input.trim() ? "not-allowed" : "pointer",
                  opacity: !input.trim() ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-sm)",
                  transition: "var(--transition-fast)",
                  height: "30px",
                }}
                title="Send message"
              >
                <SendIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
