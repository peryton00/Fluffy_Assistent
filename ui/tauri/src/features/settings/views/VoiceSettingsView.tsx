/**
 * Fluffy Desktop - Voice Settings View
 * 
 * Configures local offline speech recognition (Vosk STT) and neural voice synthesis (Piper TTS).
 * Integrates with Phase 7 voice architecture and global TTS mute/enable state.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect } from "react";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import { useChatStore, chatStore } from "../../../stores/chatStore";
import { SettingSlider } from "../components/SettingSlider";
import { SettingToggle } from "../components/SettingToggle";
import {
  MicIcon,
  Volume2Icon,
  VolumeXIcon,
  RefreshCwIcon,
  CheckIcon,
  PlayIcon,
} from "../../../components/common/Icons";

export const VoiceSettingsView: React.FC = () => {
  const { general, actionLoading, saveSuccessMessage } = useSettingsStore();
  const { ttsMuted, isSpeaking } = useChatStore();

  const [voiceSpeed, setVoiceSpeed] = useState<number>(general.voiceSpeed || 1.0);
  const [testingSpeech, setTestingSpeech] = useState<boolean>(false);

  useEffect(() => {
    settingsStore.loadAllSettings();
  }, []);

  useEffect(() => {
    if (general.voiceSpeed !== undefined) {
      setVoiceSpeed(general.voiceSpeed);
    }
  }, [general.voiceSpeed]);

  const handleSave = async () => {
    await settingsStore.updateGeneralSettings({ voiceSpeed });
  };

  const handleToggleTts = async (enabled: boolean) => {
    // If enabled is true -> ttsMuted is false, and vice versa
    await chatStore.setTtsMuted(!enabled);
  };

  const handleTestSpeech = async () => {
    if (testingSpeech || isSpeaking) return;
    setTestingSpeech(true);
    try {
      await chatStore.speak("Hello! Fluffy neural voice synthesis is operational and ready to assist you.");
    } catch {
      // Ignored
    } finally {
      setTimeout(() => setTestingSpeech(false), 2000);
    }
  };

  const isTtsEnabled = !ttsMuted;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isTtsEnabled ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
              border: `1px solid ${isTtsEnabled ? "var(--color-accent-border)" : "var(--color-border)"}`,
              color: isTtsEnabled ? "var(--color-accent)" : "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
          >
            {isTtsEnabled ? <Volume2Icon size={18} /> : <VolumeXIcon size={18} />}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-text)",
                  margin: 0,
                }}
              >
                Voice Engine Settings
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-semibold)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: isTtsEnabled ? "var(--color-success-subtle)" : "var(--color-surface-elevated)",
                  color: isTtsEnabled ? "var(--color-success)" : "var(--color-text-muted)",
                  border: `1px solid ${isTtsEnabled ? "var(--color-success-border)" : "var(--color-border)"}`,
                }}
              >
                {isTtsEnabled ? "VOICE ENABLED" : "VOICE MUTED"}
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Local Piper ONNX neural speech synthesis and Vosk offline voice recognition.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {saveSuccessMessage && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--color-success)",
                backgroundColor: "var(--color-success-subtle)",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-success-border)",
              }}
            >
              <CheckIcon size={12} />
              {saveSuccessMessage}
            </span>
          )}

          <button
            type="button"
            onClick={handleTestSpeech}
            disabled={!isTtsEnabled || testingSpeech || isSpeaking}
            title={!isTtsEnabled ? "Enable TTS first to test voice synthesis" : "Generate test speech"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface-elevated)",
              color: isTtsEnabled ? "var(--color-text)" : "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
              cursor: !isTtsEnabled || testingSpeech || isSpeaking ? "not-allowed" : "pointer",
              opacity: !isTtsEnabled || testingSpeech || isSpeaking ? 0.6 : 1,
              transition: "all var(--transition-fast)",
            }}
          >
            <PlayIcon size={12} />
            <span>{testingSpeech ? "Synthesizing..." : "Test Voice"}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={actionLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              cursor: actionLoading ? "not-allowed" : "pointer",
              opacity: actionLoading ? 0.6 : 1,
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: actionLoading ? "spin 1s linear infinite" : "none" }} />
            <span>Save Voice Config</span>
          </button>
        </div>
      </header>

      {/* Main Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "680px", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Master Voice Enable/Disable Toggle Card */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${isTtsEnabled ? "color-mix(in srgb, var(--color-accent) 40%, var(--color-border))" : "var(--color-border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            transition: "border-color var(--transition-fast)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
            <div
              style={{
                padding: "8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isTtsEnabled ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
                color: isTtsEnabled ? "var(--color-accent)" : "var(--color-text-muted)",
                display: "flex",
              }}
            >
              {isTtsEnabled ? <Volume2Icon size={18} /> : <VolumeXIcon size={18} />}
            </div>
            <div>
              <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                Enable Fluffy Voice Speech (TTS)
              </span>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, margin: "3px 0 0" }}>
                Allow Fluffy to vocalize chat responses and proactive Guardian security alerts. When disabled, Fluffy operates in silent text-only mode.
              </p>
            </div>
          </div>

          <label style={{ position: "relative", display: "inline-block", width: "40px", height: "22px", flexShrink: 0, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isTtsEnabled}
              onChange={(e) => handleToggleTts(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                cursor: "pointer",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isTtsEnabled ? "var(--color-accent)" : "var(--color-surface-elevated)",
                border: `1px solid ${isTtsEnabled ? "var(--color-accent)" : "var(--color-border)"}`,
                transition: "all var(--transition-fast)",
                borderRadius: "11px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  content: '""',
                  height: "16px",
                  width: "16px",
                  left: isTtsEnabled ? "19px" : "2px",
                  bottom: "2px",
                  backgroundColor: "#ffffff",
                  transition: "all var(--transition-fast)",
                  borderRadius: "50%",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                }}
              />
            </span>
          </label>
        </div>

        {/* Local Engine Status Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                padding: "8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                display: "flex",
              }}
            >
              <MicIcon size={16} />
            </div>
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                Vosk Offline STT
              </span>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: "2px 0 0" }}>
                Local Kaldi-based continuous speech recognition engine. 100% offline & private.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                padding: "8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isTtsEnabled ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
                color: isTtsEnabled ? "var(--color-accent)" : "var(--color-text-muted)",
                display: "flex",
              }}
            >
              {isTtsEnabled ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}
            </div>
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                Piper Neural TTS (ONNX)
              </span>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: "2px 0 0" }}>
                High-quality offline neural voice synthesizer using ONNXRuntime and en_US LJSpeech model.
              </p>
            </div>
          </div>
        </div>

        {/* Speed Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Playback Preferences
          </h3>

          <SettingToggle
            label="Mute All Voice Output"
            description="Quickly silence all conversational speech and voice alerts from Piper while retaining text responses in Chat."
            checked={ttsMuted}
            onChange={(muted) => chatStore.setTtsMuted(muted)}
          />

          <SettingSlider
            label="Speech Rate Multiplier"
            description="Playback speed for local neural voice synthesis."
            value={voiceSpeed}
            min={0.5}
            max={2.0}
            step={0.1}
            unit="x"
            onChange={setVoiceSpeed}
          />
        </div>
      </div>
    </div>
  );
};
