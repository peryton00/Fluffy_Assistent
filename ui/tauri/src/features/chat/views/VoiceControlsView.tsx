/**
 * Fluffy Desktop - VoiceControlsView Component
 * 
 * Comprehensive voice control center managing local Vosk Speech-to-Text (STT),
 * pyttsx3 Text-to-Speech (TTS), audio muting, and automated voice command execution.
 */

import React, { useState } from "react";
import { ChatHeader } from "../components/ChatHeader";
import { useChatStore } from "../../../stores/chatStore";
import { executeVoiceCommand } from "../../../services/api/chat";
import { 
  MicIcon, 
  MicOffIcon, 
  Volume2Icon, 
  PlayIcon, 
  RadioIcon, 
  TerminalIcon 
} from "../../../components/common/Icons";

export const VoiceControlsView: React.FC = () => {
  const isListening = useChatStore((state) => state.isListening);
  const isTtsMuted = useChatStore((state) => state.isTtsMuted);
  const isSpeaking = useChatStore((state) => state.isSpeaking);
  const useVoiceFeedback = useChatStore((state) => state.useVoiceFeedback);
  const partialTranscript = useChatStore((state) => state.partialTranscript);
  const finalTranscript = useChatStore((state) => state.finalTranscript);
  
  const startVoiceInput = useChatStore((state) => state.startVoiceInput);
  const stopVoiceInput = useChatStore((state) => state.stopVoiceInput);
  const toggleTtsMute = useChatStore((state) => state.toggleTtsMute);
  const toggleVoiceFeedback = useChatStore((state) => state.toggleVoiceFeedback);
  const speak = useChatStore((state) => state.speak);
  const stopSpeaking = useChatStore((state) => state.stopSpeaking);

  const [testSpeechText, setTestSpeechText] = useState("Hello! Fluffy Brain local voice synthesis is operational.");
  const [commandText, setCommandText] = useState("get system status");
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const handleToggleListening = async () => {
    setSttError(null);
    if (isListening) {
      await stopVoiceInput();
    } else {
      const ok = await startVoiceInput();
      if (!ok) {
        setSttError("Failed to start speech recognition. Check microphone permissions or ensure Vosk model is downloaded.");
      }
    }
  };

  const handleTestTts = () => {
    if (testSpeechText.trim()) {
      speak(testSpeechText.trim());
    }
  };

  const handleExecuteVoiceCmd = async () => {
    if (!commandText.trim() || isExecutingCmd) return;
    setIsExecutingCmd(true);
    setCommandResult(null);
    try {
      const res = await executeVoiceCommand(commandText.trim(), { timeoutMs: 60000 });
      setCommandResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setCommandResult(`Error executing voice command: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecutingCmd(false);
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
          overflowY: "auto",
          padding: "var(--space-4) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <span style={{ color: "var(--color-accent)", display: "flex" }}><RadioIcon size={16} /></span>
            <span>Voice & Audio Pipeline Controls</span>
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>
            Configure local Vosk speech-to-text recognition and offline pyttsx3 voice synthesis.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "var(--space-4)" }}>
          {/* Section 1: Vosk Speech-to-Text (STT) */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}><MicIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Speech Recognition (STT)
                </h3>
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: isListening ? "var(--color-danger-muted)" : "var(--color-surface-elevated)",
                  color: isListening ? "var(--color-danger)" : "var(--color-text-muted)",
                  fontWeight: "var(--font-weight-bold)",
                  border: isListening ? "1px solid var(--color-danger)" : "1px solid var(--color-border-subtle)",
                }}
              >
                {isListening ? "LISTENING" : "STANDBY"}
              </span>
            </div>

            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              Uses local Vosk lightweight acoustic model for zero-cloud, privacy-preserving speech transcription.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <button
                type="button"
                onClick={handleToggleListening}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "var(--space-2) var(--space-4)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-bold)",
                  border: `1px solid ${isListening ? "var(--color-danger)" : "var(--color-accent)"}`,
                  backgroundColor: isListening ? "var(--color-danger)" : "var(--color-accent)",
                  color: "#ffffff",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {isListening ? <MicOffIcon size={14} /> : <MicIcon size={14} />}
                <span>{isListening ? "Stop Microphone Input" : "Start Voice Listening"}</span>
              </button>
            </div>

            {sttError && (
              <div
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-warning-muted)",
                  border: "1px solid var(--color-warning)",
                  color: "var(--color-warning-text)",
                  fontSize: "11px",
                }}
              >
                {sttError}
              </div>
            )}

            {/* Transcript Area */}
            <div
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text)",
                minHeight: "48px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {isListening ? (
                <span style={{ color: "var(--color-danger)" }}>
                  {partialTranscript || "Listening... speak clearly into microphone"}
                </span>
              ) : (
                <span style={{ color: "var(--color-text-muted)" }}>
                  {finalTranscript || "Last transcribed text will appear here"}
                </span>
              )}
            </div>
          </div>

          {/* Section 2: pyttsx3 Text-to-Speech (TTS) */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-warning)", display: "flex" }}><Volume2Icon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Voice Synthesis (TTS)
                </h3>
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: isTtsMuted ? "var(--color-warning-muted)" : (isSpeaking ? "var(--color-accent-muted)" : "var(--color-surface-elevated)"),
                  color: isTtsMuted ? "var(--color-warning)" : (isSpeaking ? "var(--color-accent)" : "var(--color-text-muted)"),
                  fontWeight: "var(--font-weight-bold)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                {isTtsMuted ? "MUTED" : (isSpeaking ? "SPEAKING" : "ACTIVE")}
              </span>
            </div>

            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              Offline multi-platform text-to-speech audio synthesis powered by native OS audio drivers.
            </p>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <input
                type="text"
                value={testSpeechText}
                onChange={(e) => setTestSpeechText(e.target.value)}
                placeholder="Text to speak..."
                style={{
                  flex: 1,
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text)",
                  fontSize: "var(--font-size-xs)",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleTestTts}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-accent)",
                  color: "#ffffff",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-bold)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <PlayIcon size={12} />
                <span>Speak</span>
              </button>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => stopSpeaking()}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--color-danger)",
                    color: "#ffffff",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Stop
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingTop: "var(--space-1)" }}>
              <button
                type="button"
                onClick={() => toggleTtsMute()}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: isTtsMuted ? "var(--color-warning-muted)" : "var(--color-surface-elevated)",
                  color: isTtsMuted ? "var(--color-warning)" : "var(--color-text)",
                  fontSize: "var(--font-size-xs)",
                  cursor: "pointer",
                }}
              >
                {isTtsMuted ? "Unmute TTS Audio" : "Mute TTS Audio"}
              </button>

              <button
                type="button"
                onClick={() => toggleVoiceFeedback()}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: useVoiceFeedback ? "var(--color-accent-muted)" : "var(--color-surface-elevated)",
                  color: useVoiceFeedback ? "var(--color-accent)" : "var(--color-text)",
                  fontSize: "var(--font-size-xs)",
                  cursor: "pointer",
                }}
              >
                {useVoiceFeedback ? "Auto Voice Replies: ON" : "Auto Voice Replies: OFF"}
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Direct Voice Command Tester */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ color: "var(--color-success)", display: "flex" }}><TerminalIcon size={16} /></span>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
              Voice Command Execution Test (POST /execute_command)
            </h3>
          </div>

          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0 }}>
            Simulate a voice recognition prompt directly into the Brain intent router.
          </p>

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={commandText}
              onChange={(e) => setCommandText(e.target.value)}
              placeholder="e.g. get system status, normalize system, check alerts..."
              style={{
                flex: 1,
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-elevated)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-xs)",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleExecuteVoiceCmd}
              disabled={isExecutingCmd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-success)",
                color: "#ffffff",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                border: "none",
                cursor: isExecutingCmd ? "not-allowed" : "pointer",
                opacity: isExecutingCmd ? 0.6 : 1,
              }}
            >
              <span>{isExecutingCmd ? "Executing..." : "Execute Command"}</span>
            </button>
          </div>

          {commandResult && (
            <pre
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "11px",
                lineHeight: 1.5,
                color: "var(--color-text)",
                fontFamily: "var(--font-mono)",
                maxHeight: "200px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}
            >
              {commandResult}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
