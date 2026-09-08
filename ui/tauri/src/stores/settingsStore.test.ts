import { describe, it, expect, vi, beforeEach } from "vitest";
import { settingsStore } from "./settingsStore";
import * as apiSettings from "../services/api/settings";
import * as apiFtp from "../services/api/ftp";

vi.mock("../services/api/settings", () => ({
  fetchLlmConfig: vi.fn(),
  updateLlmConfig: vi.fn(),
  fetchLlmModels: vi.fn(),
  fetchUserPreferences: vi.fn(),
  saveUserPreferences: vi.fn(),
  executeNormalize: vi.fn(),
  clearGuardianThreats: vi.fn(),
  resetSessionContext: vi.fn(),
}));

vi.mock("../services/api/ftp", () => ({
  fetchFtpStatus: vi.fn(),
  startFtpServer: vi.fn(),
  stopFtpServer: vi.fn(),
  fetchFtpLogs: vi.fn(),
  clearFtpLogs: vi.fn(),
  disconnectFtpClient: vi.fn(),
}));

describe("SettingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads all settings and populates store state", async () => {
    vi.mocked(apiSettings.fetchUserPreferences).mockResolvedValueOnce({
      theme: "fluffyDark",
      auto_normalize: true,
      alert_threshold: 0.8,
      voice_speed: 1.2,
    });
    vi.mocked(apiSettings.fetchLlmConfig).mockResolvedValueOnce({
      ok: true,
      config: { is_configured: true, model: "anthropic/claude-3.5-sonnet" },
    });
    vi.mocked(apiSettings.fetchLlmModels).mockResolvedValueOnce([
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5", cost: "mod", recommended: true },
    ]);
    vi.mocked(apiFtp.fetchFtpStatus).mockResolvedValueOnce({
      ok: true,
      status: "stopped",
      ip: "127.0.0.1",
      port: 2121,
      username: "fluffy",
      active_clients: 0,
    });

    await settingsStore.loadAllSettings(true);
    const state = settingsStore.getState();

    expect(state.general.autoNormalize).toBe(true);
    expect(state.general.alertThreshold).toBe(0.8);
    expect(state.llmConfig?.model).toBe("anthropic/claude-3.5-sonnet");
    expect(state.llmModels).toHaveLength(1);
    expect(state.ftpStatus?.status).toBe("stopped");
  });

  it("updates general settings and calls saveUserPreferences", async () => {
    vi.mocked(apiSettings.saveUserPreferences).mockResolvedValueOnce({ ok: true });

    const success = await settingsStore.updateGeneralSettings({ voiceSpeed: 1.5 });
    expect(success).toBe(true);
    expect(settingsStore.getState().general.voiceSpeed).toBe(1.5);
    expect(apiSettings.saveUserPreferences).toHaveBeenCalled();
  });

  it("saves LLM settings", async () => {
    vi.mocked(apiSettings.updateLlmConfig).mockResolvedValueOnce({
      ok: true,
      config: { is_configured: true, model: "openai/gpt-4o" },
    });

    const success = await settingsStore.saveLlmSettings("sk-or-test", "openai/gpt-4o");
    expect(success).toBe(true);
    expect(settingsStore.getState().llmConfig?.model).toBe("openai/gpt-4o");
  });

  it("starts and stops FTP server", async () => {
    vi.mocked(apiFtp.startFtpServer).mockResolvedValueOnce({
      ok: true,
      success: true,
      status: "running",
      ip: "192.168.1.10",
      port: 2121,
      username: "fluffy",
    });
    vi.mocked(apiFtp.fetchFtpStatus).mockResolvedValue({
      ok: true,
      status: "running",
      ip: "192.168.1.10",
      port: 2121,
      username: "fluffy",
      active_clients: 0,
    });

    const started = await settingsStore.startFtp();
    expect(started).toBe(true);

    vi.mocked(apiFtp.stopFtpServer).mockResolvedValueOnce({ ok: true, status: "stopped" });
    const stopped = await settingsStore.stopFtp();
    expect(stopped).toBe(true);
  });
});
