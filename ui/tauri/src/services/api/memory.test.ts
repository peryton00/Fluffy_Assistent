import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLongTermMemory,
  updateLongTermMemory,
  fetchPreferences,
  setPreference,
  fetchChatSessions,
  fetchChatSession,
  deleteChatSession,
  fetchCurrentSessionId,
  fetchSessionStatus,
  resetSessionMemory,
} from "./memory";
import { apiClient } from "./client";

describe("Memory API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches long term memory via GET /memory", async () => {
    const mockProfile = { name: "Alice", facts: ["Uses Python", "Prefers Dark Mode"] };
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, memory: mockProfile });

    const result = await fetchLongTermMemory();

    expect(getSpy).toHaveBeenCalledWith("/memory", undefined);
    expect(result).toEqual(mockProfile);
  });

  it("updates long term memory via POST /memory", async () => {
    const updatedProfile = { name: "Bob", facts: ["Fact 1"] };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, memory: updatedProfile });

    const result = await updateLongTermMemory(updatedProfile);

    expect(postSpy).toHaveBeenCalledWith("/memory", updatedProfile, undefined);
    expect(result).toEqual(updatedProfile);
  });

  it("fetches preferences via GET /memory/preferences", async () => {
    const mockPrefs = { theme: "dark", editor: "vscode" };
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, preferences: mockPrefs });

    const result = await fetchPreferences();

    expect(getSpy).toHaveBeenCalledWith("/memory/preferences", undefined);
    expect(result).toEqual(mockPrefs);
  });

  it("sets preference via POST /memory/preferences", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await setPreference("browser", "chrome");

    expect(postSpy).toHaveBeenCalledWith("/memory/preferences", { key: "browser", value: "chrome" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("fetches chat sessions list via GET /chat/sessions", async () => {
    const mockSessions = [
      { id: "sess-1", title: "Discussion 1", message_count: 5 },
      { id: "sess-2", title: "Discussion 2", message_count: 12 },
    ];
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, sessions: mockSessions });

    const result = await fetchChatSessions();

    expect(getSpy).toHaveBeenCalledWith("/chat/sessions", undefined);
    expect(result).toEqual(mockSessions);
  });

  it("fetches chat session detail via GET /chat/session/<id>", async () => {
    const mockDetail = {
      id: "sess-1",
      messages: [{ role: "user", content: "hello" }],
    };
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, session: mockDetail });

    const result = await fetchChatSession("sess-1");

    expect(getSpy).toHaveBeenCalledWith("/chat/session/sess-1", undefined);
    expect(result).toEqual(mockDetail);
  });

  it("deletes chat session via DELETE /chat/session/<id>", async () => {
    const delSpy = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    const result = await deleteChatSession("sess-1");

    expect(delSpy).toHaveBeenCalledWith("/chat/session/sess-1", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("fetches active session ID and status", async () => {
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ session_id: "sess-active" })
      .mockResolvedValueOnce({ ok: true, session: { has_context: true, active_intent: "deploy_service" } });

    const activeId = await fetchCurrentSessionId();
    expect(activeId).toBe("sess-active");

    const status = await fetchSessionStatus();
    expect(status.has_context).toBe(true);
    expect(status.active_intent).toBe("deploy_service");
  });

  it("resets session memory via POST /session/reset", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await resetSessionMemory();

    expect(postSpy).toHaveBeenCalledWith("/session/reset", undefined, undefined);
    expect(result.ok).toBe(true);
  });
});
