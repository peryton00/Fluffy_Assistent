/**
 * Component and View Tests for Chat Workspace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatWorkspace } from "./ChatWorkspace";
import { ChatHeader } from "./components/ChatHeader";
import { ToolExecutionCard } from "./components/ToolExecutionCard";
import { ApprovalRequestCard } from "./components/ApprovalRequestCard";
import { StreamingMessage } from "./components/StreamingMessage";
import { MessageBubble } from "./components/MessageBubble";
import { uiStore } from "../../stores/uiStore";
import { chatStore } from "../../stores/chatStore";

vi.mock("../../services/api/chat", () => ({
  sendChatMessage: vi.fn(),
  streamChatMessage: vi.fn(),
  createChatSession: vi.fn().mockResolvedValue({ ok: true, session_id: "test-sess-1" }),
  fetchChatSessions: vi.fn().mockResolvedValue([]),
  fetchChatSession: vi.fn().mockResolvedValue({ id: "test-sess-1", messages: [] }),
  deleteChatSession: vi.fn().mockResolvedValue({ ok: true }),
  fetchCurrentSessionId: vi.fn().mockResolvedValue({ ok: true, session_id: "test-sess-1" }),
  startStt: vi.fn().mockResolvedValue({ ok: true, status: "listening" }),
  stopStt: vi.fn().mockResolvedValue({ ok: true, status: "stopped" }),
  fetchSttStatus: vi.fn().mockResolvedValue({ ok: true, status: "stopped", text: "", partial: "" }),
  setTtsMute: vi.fn().mockResolvedValue({ ok: true, muted: false }),
  fetchTtsMuteStatus: vi.fn().mockResolvedValue({ ok: true, muted: false }),
  speakText: vi.fn().mockResolvedValue({ ok: true }),
  stopSpeech: vi.fn().mockResolvedValue({ ok: true }),
  executeVoiceCommand: vi.fn().mockResolvedValue({ ok: true, result: "mock result" }),
}));

describe("Chat Feature Components", () => {
  beforeEach(() => {
    chatStore._resetForTest();
    uiStore.selectChatSection("conversation");
  });

  it("renders ChatHeader with domain title and action buttons", () => {
    const html = renderToStaticMarkup(React.createElement(ChatHeader));
    expect(html).toContain("Fluffy Brain");
    expect(html).toContain("Conversation");
    expect(html).toContain("Sessions");
    expect(html).toContain("Context");
    expect(html).toContain("Voice Controls");
    expect(html).toContain("New Session");
  });

  it("renders ToolExecutionCard with command and output", () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolExecutionCard, {
        command: "ls -la",
        result: { total: 42, files: ["file1.txt", "file2.txt"] },
        status: "success",
      })
    );

    expect(html).toContain("ls -la");
    expect(html).toContain("Executed");
    expect(html).toContain("file1.txt");
  });

  it("renders ApprovalRequestCard with action name and review CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalRequestCard, {
        actionName: "Delete Database Directory",
        reason: "Path /data is protected by Guardian",
      })
    );

    expect(html).toContain("Guardian Authorization Required");
    expect(html).toContain("Delete Database Directory");
    expect(html).toContain("Review in Guardian");
  });

  it("renders StreamingMessage when generating", () => {
    const html = renderToStaticMarkup(React.createElement(StreamingMessage));
    expect(html).toContain("Fluffy Brain");
    expect(html).toContain("Generating...");
    expect(html).toContain("Stop");
  });

  it("renders MessageBubble for user, assistant, and system", () => {
    const userMsg = {
      id: "u1",
      role: "user" as const,
      content: "What is my IP address?",
      timestamp: Date.now(),
    };

    const userHtml = renderToStaticMarkup(React.createElement(MessageBubble, { message: userMsg }));
    expect(userHtml).toContain("Operator");
    expect(userHtml).toContain("What is my IP address?");

    const assistantMsg = {
      id: "a1",
      role: "assistant" as const,
      content: "Your local IP is 127.0.0.1",
      timestamp: Date.now(),
    };

    const asstHtml = renderToStaticMarkup(React.createElement(MessageBubble, { message: assistantMsg }));
    expect(asstHtml).toContain("Fluffy Brain");
    expect(asstHtml).toContain("Your local IP is 127.0.0.1");
  });

  it("ChatWorkspace switches between sections based on uiStore", () => {
    uiStore.selectChatSection("conversation");
    const convHtml = renderToStaticMarkup(React.createElement(ChatWorkspace));
    expect(convHtml).toContain("Fluffy Brain");

    uiStore.selectChatSection("sessions");
    const sessHtml = renderToStaticMarkup(React.createElement(ChatWorkspace));
    expect(sessHtml).toContain("Chat Sessions");

    uiStore.selectChatSection("context");
    const ctxHtml = renderToStaticMarkup(React.createElement(ChatWorkspace));
    expect(ctxHtml).toContain("Brain Runtime Context");

    uiStore.selectChatSection("voice");
    const voiceHtml = renderToStaticMarkup(React.createElement(ChatWorkspace));
    expect(voiceHtml).toContain("Voice &amp; Audio Pipeline Controls");
  });
});
