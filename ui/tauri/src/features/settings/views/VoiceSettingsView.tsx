/**
 * Fluffy Desktop - Voice Settings View
 * 
 * Configures local offline speech recognition (Vosk) and voice synthesis (pyttsx3).
 * Integrates with existing Phase 7 voice architecture.
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
} from "../../../components/common/Icons";

export const VoiceSettingsView: React.FC = () => {
  const { general, actionLoading, saveSuccessMessage } = useSettingsStore();
  const { ttsMuted } = useChatStore();

  const [voiceSpeed, setVoiceSpeed] = useState<number>(general.voiceSpeed || 1.0);

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

  const handleToggleMute = async (muted: boolean) => {
    await chatStore.setTtsMuted(muted);
  };

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
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MicIcon size={18} />
          </div>
          <div>
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
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Local Vosk STT recognition and pyttsx3 speech synthesis.
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
                backgroundColor: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                display: "flex",
              }}
            >
              {ttsMuted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
            </div>
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                pyttsx3 Offline TTS
              </span>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: "2px 0 0" }}>
                Native OS speech synthesizer (SAPI5 / AVFoundation). Zero network calls.
              </p>
            </div>
          </div>
        </div>

        {/* Mute and Speed Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Playback Preferences
          </h3>

          <SettingToggle
            label="Mute Voice Output"
            description="Silence conversational voice responses from pyttsx3 while maintaining text responses in Chat."
            checked={ttsMuted}
            onChange={handleToggleMute}
          />

          <SettingSlider
            label="Speech Rate Multiplier"
            description="Playback speed for local voice synthesis."
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
