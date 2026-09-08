import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStore } from "./memoryStore";
import * as memoryApi from "../services/api/memory";

describe("Memory Store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads long term profile", async () => {
    const mockProfile = { name: "AgentUser", facts: ["Fact A", "Fact B"] };
    vi.spyOn(memoryApi, "fetchLongTermMemory").mockResolvedValue(mockProfile);

    await memoryStore.loadProfile(true);

    expect(memoryStore.getState().profile).toEqual(mockProfile);
  });

  it("saves profile and updates state", async () => {
    const updatedProfile = { name: "AgentUser2", facts: ["Fact A", "Fact C"] };
    vi.spyOn(memoryApi, "updateLongTermMemory").mockResolvedValue(updatedProfile);

    await memoryStore.saveProfile(updatedProfile);

    expect(memoryStore.getState().profile).toEqual(updatedProfile);
  });

  it("loads and updates preferences", async () => {
    vi.spyOn(memoryApi, "fetchPreferences").mockResolvedValue({ editor: "nano" });
    vi.spyOn(memoryApi, "setPreference").mockResolvedValue({ ok: true });

    await memoryStore.loadPreferences(true);
    expect(memoryStore.getState().preferences).toEqual({ editor: "nano" });

    await memoryStore.updatePreference("editor", "vim");
    expect(memoryStore.getState().preferences.editor).toBe("vim");
  });

  it("loads and deletes conversation sessions", async () => {
    const sessions = [{ id: "sess-1", title: "Chat 1", message_count: 3 }];
    vi.spyOn(memoryApi, "fetchChatSessions").mockResolvedValue(sessions);
    vi.spyOn(memoryApi, "deleteChatSession").mockResolvedValue({ ok: true });

    await memoryStore.loadSessions(true);
    expect(memoryStore.getState().sessions).toEqual(sessions);

    await memoryStore.removeSession("sess-1");
    expect(memoryStore.getState().sessions).toEqual([]);
  });

  it("resets runtime session memory and intent", async () => {
    const resetSpy = vi.spyOn(memoryApi, "resetSessionMemory").mockResolvedValue({ ok: true });
    vi.spyOn(memoryApi, "fetchSessionStatus").mockResolvedValue({ has_context: false, active_intent: null });

    await memoryStore.resetRuntimeSession();

    expect(resetSpy).toHaveBeenCalled();
    expect(memoryStore.getState().sessionStatus?.has_context).toBe(false);
  });
});
