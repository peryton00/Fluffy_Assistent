/**
 * Component and View Tests for Settings Workspace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsWorkspace } from "./SettingsWorkspace";
import { SettingToggle } from "./components/SettingToggle";
import { SettingSlider } from "./components/SettingSlider";
import { settingsStore } from "../../stores/settingsStore";
import { uiStore } from "../../stores/uiStore";

vi.mock("../../services/api/settings", () => ({
  fetchLlmConfig: vi.fn(async () => ({
    ok: true,
    config: { is_configured: true, model: "anthropic/claude-3.5-sonnet" },
  })),
  updateLlmConfig: vi.fn(async () => ({ ok: true })),
  fetchLlmModels: vi.fn(async () => [
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", cost: "mod", recommended: true },
  ]),
  fetchUserPreferences: vi.fn(async () => ({
    theme: "fluffyDark",
    auto_normalize: true,
    alert_threshold: 0.7,
    voice_speed: 1.0,
  })),
  saveUserPreferences: vi.fn(async () => ({ ok: true })),
  executeNormalize: vi.fn(async () => ({ ok: true, memory_freed_mb: 120 })),
  clearGuardianThreats: vi.fn(async () => ({ ok: true })),
  resetSessionContext: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../services/api/ftp", () => ({
  fetchFtpStatus: vi.fn(async () => ({
    ok: true,
    status: "stopped",
    ip: "127.0.0.1",
    port: 2121,
    username: "fluffy",
    active_clients: 0,
  })),
  startFtpServer: vi.fn(async () => ({ ok: true, success: true, status: "running" })),
  stopFtpServer: vi.fn(async () => ({ ok: true, status: "stopped" })),
  fetchFtpLogs: vi.fn(async () => []),
  clearFtpLogs: vi.fn(async () => ({ ok: true })),
  disconnectFtpClient: vi.fn(async () => ({ ok: true })),
}));

describe("Settings Workspace", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await settingsStore.loadAllSettings(true);
  });

  it("renders SettingToggle with label and description", () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingToggle, {
        label: "Auto-Normalize",
        description: "Compact memory automatically",
        checked: true,
        onChange: () => {},
      })
    );

    expect(html).toContain("Auto-Normalize");
    expect(html).toContain("Compact memory automatically");
    expect(html).toContain('role="switch"');
  });

  it("renders SettingSlider with numeric range and unit", () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingSlider, {
        label: "Sensitivity Threshold",
        value: 0.75,
        min: 0.1,
        max: 0.9,
        step: 0.05,
        onChange: () => {},
      })
    );

    expect(html).toContain("Sensitivity Threshold");
    expect(html).toContain("0.75");
    expect(html).toContain('type="range"');
  });

  it("renders GeneralView when view is general", () => {
    uiStore.selectSettingsSection("general");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("General Configuration");
    expect(html).toContain("Autonomous Resource Normalization");
  });

  it("renders AppearanceView when view is appearance", () => {
    uiStore.selectSettingsSection("appearance");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("Appearance &amp; Theme");
    expect(html).toContain("Fluffy Dark");
    expect(html).toContain("Fluffy Light");
    expect(html).toContain("High Contrast");
  });

  it("renders AiModelsView when view is models", () => {
    uiStore.selectSettingsSection("models");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("AI / Model Router Configuration");
    expect(html).toContain("OpenRouter API Key");
  });

  it("renders VoiceSettingsView when view is voice", () => {
    uiStore.selectSettingsSection("voice");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("Voice Engine Settings");
    expect(html).toContain("Vosk Offline STT");
    expect(html).toContain("pyttsx3 Offline TTS");
  });

  it("renders FtpSettingsView when view is ftp", () => {
    uiStore.selectSettingsSection("ftp");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("Local FTP Server");
    expect(html).toContain("Port: 2121 (TCP)");
  });

  it("renders AdvancedView when view is advanced", () => {
    uiStore.selectSettingsSection("advanced");
    const html = renderToStaticMarkup(React.createElement(SettingsWorkspace));

    expect(html).toContain("Advanced Diagnostics &amp; Operations");
    expect(html).toContain("Run Normalizer");
    expect(html).toContain("Clear Threat Cache");
  });
});
