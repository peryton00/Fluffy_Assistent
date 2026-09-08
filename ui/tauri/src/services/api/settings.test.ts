import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import {
  fetchLlmConfig,
  updateLlmConfig,
  fetchLlmModels,
  fetchUserPreferences,
  saveUserPreferences,
  executeNormalize,
  clearGuardianThreats,
  resetSessionContext,
} from "./settings";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("Settings API Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchLlmConfig calls GET /llm/config", async () => {
    const mockConfig = { ok: true, config: { is_configured: true, model: "anthropic/claude-3.5-sonnet" } };
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockConfig);

    const result = await fetchLlmConfig();
    expect(apiClient.get).toHaveBeenCalledWith("/llm/config", undefined);
    expect(result).toEqual(mockConfig);
  });

  it("updateLlmConfig calls POST /llm/config with payload", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, config: { model: "meta-llama/llama-3-70b" } });

    const result = await updateLlmConfig({ model: "meta-llama/llama-3-70b" });
    expect(apiClient.post).toHaveBeenCalledWith("/llm/config", { model: "meta-llama/llama-3-70b" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("fetchLlmModels calls GET /llm/models and returns array", async () => {
    const mockModels = [{ id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", cost: "moderate", recommended: true }];
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, models: mockModels });

    const result = await fetchLlmModels();
    expect(apiClient.get).toHaveBeenCalledWith("/llm/models", undefined);
    expect(result).toEqual(mockModels);
  });

  it("fetchUserPreferences calls GET /memory/preferences", async () => {
    const mockPrefs = { theme: "fluffyDark", auto_normalize: true };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, preferences: mockPrefs });

    const result = await fetchUserPreferences();
    expect(apiClient.get).toHaveBeenCalledWith("/memory/preferences", undefined);
    expect(result).toEqual(mockPrefs);
  });

  it("saveUserPreferences calls POST /memory/preferences", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Saved" });

    const result = await saveUserPreferences({ theme: "fluffyDark" });
    expect(apiClient.post).toHaveBeenCalledWith("/memory/preferences", { preferences: { theme: "fluffyDark" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("executeNormalize calls POST /normalize", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, memory_freed_mb: 256, actions: 3 });

    const result = await executeNormalize();
    expect(apiClient.post).toHaveBeenCalledWith("/normalize", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("clearGuardianThreats calls POST /clear_guardian", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Cleared" });

    const result = await clearGuardianThreats();
    expect(apiClient.post).toHaveBeenCalledWith("/clear_guardian", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("resetSessionContext calls POST /session/reset", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Reset" });

    const result = await resetSessionContext();
    expect(apiClient.post).toHaveBeenCalledWith("/session/reset", undefined, undefined);
    expect(result.ok).toBe(true);
  });
});
