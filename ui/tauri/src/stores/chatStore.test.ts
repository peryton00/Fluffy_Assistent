/**
 * Tests for ChatStoreManager
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatStore } from "./chatStore";
import * as chatApi from "../services/api/chat";

vi.mock("../services/api/chat");

describe("ChatStoreManager", () => {
  beforeEach(() => {
    chatStore._resetForTest();
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = chatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.activeSessionId).toBeNull();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingMessage).toBe("");
    expect(state.sttListening).toBe(false);
    expect(state.ttsMuted).toBe(false);
  });

  it("loadSessions populates sessions and activeSessionId", async () => {
    vi.mocked(chatApi.fetchChatSessions).mockResolvedValue([
      { id: "sess-1", title: "Session 1", created: 1000, last_updated: 1000, message_count: 2 },
    ]);
    vi.mocked(chatApi.fetchCurrentSessionId).mockResolvedValue({
      ok: true,
      session_id: "sess-1",
    });
    vi.mocked(chatApi.fetchChatSession).mockResolvedValue({
      id: "sess-1",
      messages: [
        { id: "msg-1", role: "user", content: "Hello", timestamp: 1000 },
        { id: "msg-2", role: "assistant", content: "Hi operator", timestamp: 1001 },
      ],
    });

    await chatStore.loadSessions();

    const state = chatStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe("sess-1");
    expect(state.messages).toHaveLength(2);
  });

  it("loadSessions preserves activeSessionId if already active and valid", async () => {
    vi.mocked(chatApi.fetchChatSessions).mockResolvedValue([
      { id: "sess-1", title: "Session 1", created: 1000, last_updated: 1000, message_count: 2 },
      { id: "sess-2", title: "Session 2", created: 2000, last_updated: 2000, message_count: 1 },
    ]);
    vi.mocked(chatApi.fetchCurrentSessionId).mockResolvedValue({
      ok: true,
      session_id: "sess-1",
    });
    vi.mocked(chatApi.fetchChatSession).mockResolvedValue({
      id: "sess-2",
      messages: [
        { id: "msg-2", role: "user", content: "Session 2 msg", timestamp: 2000 },
      ],
    });

    // Manually switch to sess-2
    await chatStore.switchSession("sess-2");
    expect(chatStore.getState().activeSessionId).toBe("sess-2");

    // Re-load sessions (e.g. background refresh)
    await chatStore.loadSessions();

    // Should NOT be clobbered back to sess-1
    expect(chatStore.getState().activeSessionId).toBe("sess-2");
  });

  it("newSession creates a session and resets message buffer", async () => {
    vi.mocked(chatApi.createChatSession).mockResolvedValue({
      ok: true,
      session_id: "sess-new-456",
    });

    const newId = await chatStore.newSession();
    expect(newId).toBe("sess-new-456");

    const state = chatStore.getState();
    expect(state.activeSessionId).toBe("sess-new-456");
    expect(state.messages).toEqual([]);
  });

  it("switchSession updates active session, notifies backend, and loads messages", async () => {
    vi.mocked(chatApi.setCurrentSessionId).mockResolvedValue({ ok: true, session_id: "sess-switch-789" });
    vi.mocked(chatApi.fetchChatSession).mockResolvedValue({
      id: "sess-switch-789",
      messages: [
        { id: "msg-3", role: "user", content: "Status report", timestamp: 2000 },
      ],
    });

    await chatStore.switchSession("sess-switch-789");

    const state = chatStore.getState();
    expect(state.activeSessionId).toBe("sess-switch-789");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Status report");
    expect(chatApi.setCurrentSessionId).toHaveBeenCalledWith("sess-switch-789");
  });

  it("deleteSession calls API and removes session from state", async () => {
    chatStore._resetForTest();
    vi.mocked(chatApi.fetchChatSessions).mockResolvedValue([
      { id: "sess-del", title: "To Delete", created: 1000, last_updated: 1000, message_count: 0 },
    ]);
    vi.mocked(chatApi.deleteChatSession).mockResolvedValue(true);

    await chatStore.loadSessions();
    const success = await chatStore.deleteSession("sess-del");

    expect(success).toBe(true);
    expect(chatStore.getState().sessions).toHaveLength(0);
  });

  it("clearCurrentMessages empties messages list", () => {
    chatStore.clearCurrentMessages();
    expect(chatStore.getState().messages).toEqual([]);
  });

  it("toggleVoiceFeedback toggles useVoice flag", () => {
    expect(chatStore.getState().useVoice).toBe(false);
    chatStore.toggleVoiceFeedback();
    expect(chatStore.getState().useVoice).toBe(true);
    chatStore.toggleVoiceFeedback();
    expect(chatStore.getState().useVoice).toBe(false);
  });

  it("toggleTtsMute calls setTtsMute and updates state", async () => {
    vi.mocked(chatApi.setTtsMute).mockResolvedValue({ ok: true, muted: true });

    await chatStore.toggleTtsMute();
    expect(chatStore.getState().ttsMuted).toBe(true);
  });

  it("startVoiceInput and stopVoiceInput update sttListening", async () => {
    vi.mocked(chatApi.startStt).mockResolvedValue({ ok: true, status: "listening" });
    vi.mocked(chatApi.stopStt).mockResolvedValue({ ok: true, status: "stopped" });

    const started = await chatStore.startVoiceInput();
    expect(started).toBe(true);
    expect(chatStore.getState().sttListening).toBe(true);

    await chatStore.stopVoiceInput();
    expect(chatStore.getState().sttListening).toBe(false);
  });

  it("stopGeneration resets isStreaming state", () => {
    chatStore.stopGeneration();
    expect(chatStore.getState().isStreaming).toBe(false);
    expect(chatStore.getState().streamingMessage).toBe("");
  });
});
