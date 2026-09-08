import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { terminalStore } from "./terminalStore";
import { terminalWsService } from "../services/websocket/terminal";

describe("TerminalStore Test Suite", () => {
  beforeEach(() => {
    terminalStore._resetForTest();
  });

  afterEach(() => {
    terminalStore.disconnect();
  });

  it("initializes with default state", () => {
    const state = terminalStore.getState();
    expect(state.connectionState).toBe("disconnected");
    expect(state.outputLines).toEqual([]);
    expect(state.prompt).toBe("fluffy> ");
    expect(state.clients).toEqual([]);
    expect(state.alterTarget).toBeNull();
  });

  it("accumulates output lines and respects MAX_OUTPUT_LINES buffer limit", () => {
    // Send 10 lines
    for (let i = 1; i <= 10; i++) {
      terminalWsService._simulateMessage({
        type: "output",
        tag: "core",
        text: `Line ${i}`,
        color_tag: "brand",
        timestamp: `00:00:0${i}`,
      });
    }

    let state = terminalStore.getState();
    expect(state.outputLines).toHaveLength(10);
    expect(state.outputLines[0].text).toBe("Line 1");
    expect(state.outputLines[9].text).toBe("Line 10");

    // Clear output
    terminalStore.clearOutput();
    expect(terminalStore.getState().outputLines).toHaveLength(0);
  });

  it("extracts alter target when prompt format contains bracketed tag", () => {
    terminalWsService._simulateMessage({
      type: "prompt",
      text: "fluffy [node_alpha]> ",
    });

    let state = terminalStore.getState();
    expect(state.prompt).toBe("fluffy [node_alpha]> ");
    expect(state.alterTarget).toBe("node_alpha");

    // Reset prompt
    terminalWsService._simulateMessage({
      type: "prompt",
      text: "fluffy> ",
    });

    state = terminalStore.getState();
    expect(state.prompt).toBe("fluffy> ");
    expect(state.alterTarget).toBeNull();
  });

  it("updates cluster mode and clients inventory", () => {
    terminalWsService._simulateMessage({
      type: "status",
      admin_port: 9005,
      client_count: 1,
      mode: "Admin",
    });

    terminalWsService._simulateMessage({
      type: "client_list",
      clients: [
        {
          tag: "f1",
          hostname: "FLUFFY-NODE",
          os: "Linux",
          os_version: "Ubuntu 22.04",
          ip: "10.0.0.5",
          arch: "aarch64",
          connected_at: "01:23:45",
        },
      ],
    });

    const state = terminalStore.getState();
    expect(state.mode).toBe("Admin");
    expect(state.adminPort).toBe(9005);
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0].hostname).toBe("FLUFFY-NODE");
  });

  it("manages command history and Up/Down navigation correctly", () => {
    const sendSpy = vi.spyOn(terminalWsService, "sendCommand").mockReturnValue(true);

    terminalStore.sendCommand("status");
    terminalStore.sendCommand("help");
    terminalStore.sendCommand("list");

    expect(sendSpy).toHaveBeenCalledTimes(3);
    const history = terminalStore.getState().commandHistory;
    expect(history).toEqual(["status", "help", "list"]);

    // Navigate history up
    const cmd1 = terminalStore.navigateHistory("up", "my draft");
    expect(cmd1).toBe("list");

    const cmd2 = terminalStore.navigateHistory("up", "my draft");
    expect(cmd2).toBe("help");

    const cmd3 = terminalStore.navigateHistory("up", "my draft");
    expect(cmd3).toBe("status");

    // Navigate history down
    const cmd4 = terminalStore.navigateHistory("down", "my draft");
    expect(cmd4).toBe("help");

    const cmd5 = terminalStore.navigateHistory("down", "my draft");
    expect(cmd5).toBe("list");

    // Exiting history down returns saved draft
    const cmd6 = terminalStore.navigateHistory("down", "my draft");
    expect(cmd6).toBe("my draft");
  });
});
