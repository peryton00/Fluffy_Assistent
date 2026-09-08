/**
 * Tests for Chat & Voice API Service Layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendChatMessage,
  createChatSession,
  fetchChatSessions,
  deleteChatSession,
  startStt,
  stopStt,
  speakText,
  stopSpeech,
  setTtsMute,
  fetchTtsMuteStatus,
  executeVoiceCommand,
} from "./chat";
import { apiClient } from "./client";

describe("Chat & Voice API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendChatMessage posts message to /chat/message", async () => {
    const mockResponse = { ok: true, type: "llm", message: "Hello operator!" };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(mockResponse);

    const res = await sendChatMessage("Hello", "sess-1", false);
    expect(res).toEqual(mockResponse);
    expect(postSpy).toHaveBeenCalledWith(
      "/chat/message",
      { message: "Hello", session_id: "sess-1", use_voice: false },
      { timeoutMs: 60000 }
    );
  });

  it("createChatSession posts to /chat/create_session", async () => {
    const mockResponse = { ok: true, session_id: "new-sess-123" };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(mockResponse);

    const res = await createChatSession();
    expect(res).toEqual(mockResponse);
    expect(postSpy).toHaveBeenCalledWith("/chat/create_session", undefined, undefined);
  });

  it("fetchChatSessions requests GET /chat/sessions", async () => {
    const mockSessions = [{ id: "sess-1", title: "Session 1" }];
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, sessions: mockSessions });

    const res = await fetchChatSessions();
    expect(res).toEqual(mockSessions);
    expect(getSpy).toHaveBeenCalledWith("/chat/sessions", undefined);
  });

  it("deleteChatSession sends DELETE /chat/session/:id", async () => {
    const deleteSpy = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    const res = await deleteChatSession("sess-1");
    expect(res).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith("/chat/session/sess-1", undefined, undefined);
  });

  it("startStt and stopStt call /test_stt and /stop_stt", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, status: "listening" });

    const resStart = await startStt();
    expect(resStart.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledWith("/test_stt", undefined, undefined);

    const resStop = await stopStt();
    expect(resStop.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledWith("/stop_stt", undefined, undefined);
  });

  it("speakText and stopSpeech call TTS endpoints", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const resSpeak = await speakText("Test Speech");
    expect(resSpeak.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledWith("/tts/speak", { text: "Test Speech" }, undefined);

    const resStop = await stopSpeech();
    expect(resStop.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledWith("/tts/stop", undefined, undefined);
  });

  it("setTtsMute and fetchTtsMuteStatus work correctly", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, muted: true });
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, muted: true });

    const resMute = await setTtsMute(true);
    expect(resMute.muted).toBe(true);
    expect(postSpy).toHaveBeenCalledWith("/tts/mute", { muted: true }, undefined);

    const resStatus = await fetchTtsMuteStatus();
    expect(resStatus.muted).toBe(true);
    expect(getSpy).toHaveBeenCalledWith("/tts/mute/status", undefined);
  });

  it("executeVoiceCommand sends POST /execute_command", async () => {
    const mockResponse = { ok: true, command: "get system status", type: "command", result: {} };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(mockResponse);

    const res = await executeVoiceCommand("get system status");
    expect(res).toEqual(mockResponse);
    expect(postSpy).toHaveBeenCalledWith("/execute_command", { command: "get system status" }, { timeoutMs: 60000 });
  });
});
