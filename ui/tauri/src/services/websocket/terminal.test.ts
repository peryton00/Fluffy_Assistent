import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TerminalWebSocketService } from "./terminal";
import type {
  TerminalOutputMessage,
  TerminalPromptMessage,
  TerminalStatusMessage,
  TerminalClientListMessage,
} from "../../types/contracts";

describe("TerminalWebSocketService Test Suite", () => {
  let service: TerminalWebSocketService;

  beforeEach(() => {
    service = new TerminalWebSocketService("ws://127.0.0.1:9003");
  });

  afterEach(() => {
    service.disconnect();
  });

  it("initializes in disconnected state", () => {
    expect(service.getState()).toBe("disconnected");
  });

  it("handles incoming output messages and notifies subscribers", () => {
    const messageHandler = vi.fn();
    const unsub = service.onMessage(messageHandler);

    const mockOutput: TerminalOutputMessage = {
      type: "output",
      tag: "system",
      text: "System initialized",
      color_tag: "brand",
      timestamp: "12:00:00",
    };

    service._simulateMessage(mockOutput);

    expect(messageHandler).toHaveBeenCalledTimes(1);
    expect(messageHandler).toHaveBeenCalledWith(mockOutput);

    unsub();
    service._simulateMessage(mockOutput);
    expect(messageHandler).toHaveBeenCalledTimes(1);
  });

  it("handles prompt, status, and client_list messages", () => {
    const messages: unknown[] = [];
    service.onMessage((m) => messages.push(m));

    const mockPrompt: TerminalPromptMessage = {
      type: "prompt",
      text: "fluffy [f1]> ",
    };

    const mockStatus: TerminalStatusMessage = {
      type: "status",
      admin_port: 9000,
      client_count: 3,
      mode: "Admin",
    };

    const mockClientList: TerminalClientListMessage = {
      type: "client_list",
      clients: [
        {
          tag: "f1",
          hostname: "NODE-1",
          os: "Windows",
          os_version: "11",
          ip: "192.168.1.10",
          arch: "x86_64",
          connected_at: "12:00:00",
        },
      ],
    };

    service._simulateMessage(mockPrompt);
    service._simulateMessage(mockStatus);
    service._simulateMessage(mockClientList);

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual(mockPrompt);
    expect(messages[1]).toEqual(mockStatus);
    expect(messages[2]).toEqual(mockClientList);
  });

  it("notifies state change listeners on state transition", () => {
    const stateHandler = vi.fn();
    service.onStateChange(stateHandler);

    service._simulateState("connecting");
    expect(stateHandler).toHaveBeenCalledWith("connecting");

    service._simulateState("connected");
    expect(stateHandler).toHaveBeenCalledWith("connected");
    expect(service.getState()).toBe("connected");
  });

  it("disconnect sets state to disconnected and stops reconnection", () => {
    service._simulateState("connected");
    service.disconnect();

    expect(service.getState()).toBe("disconnected");
  });
});
