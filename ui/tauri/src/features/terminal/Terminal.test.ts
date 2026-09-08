import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { AgentNodesView } from "./views/AgentNodesView";
import { TerminalHeader } from "./components/TerminalHeader";
import { TerminalViewport } from "./components/TerminalViewport";
import { TerminalInput } from "./components/TerminalInput";
import { TerminalToolbar } from "./components/TerminalToolbar";
import { terminalStore } from "../../stores/terminalStore";
import { terminalWsService } from "../../services/websocket/terminal";
import { uiStore } from "../../stores/uiStore";

describe("Terminal Domain Component Tests", () => {
  beforeEach(() => {
    terminalStore._resetForTest();
    uiStore.selectTerminalSection("console");
  });

  afterEach(() => {
    terminalStore.disconnect();
    vi.restoreAllMocks();
  });

  it("renders TerminalHeader with connection state and alter target", () => {
    terminalWsService._simulateState("connected");
    terminalWsService._simulateMessage({
      type: "prompt",
      text: "fluffy [node_1]> ",
    });

    const html = renderToStaticMarkup(React.createElement(TerminalHeader));

    expect(html).toContain("Core Terminal");
    expect(html).toContain("ws://127.0.0.1:9003");
    expect(html).toContain("CONNECTED");
    expect(html).toContain("Agent [node_1]");
    expect(html).toContain("Local Console");
    expect(html).toContain("Agent Nodes");
    expect(html).toContain("Clear");
    expect(html).toContain("Reconnect");
  });

  it("renders TerminalViewport with streaming output lines", () => {
    terminalWsService._simulateState("connected");
    terminalWsService._simulateMessage({
      type: "output",
      tag: "system",
      text: "Fluffy Core REPL online.",
      color_tag: "brand",
      timestamp: "10:15:00",
    });
    terminalWsService._simulateMessage({
      type: "output",
      tag: "core",
      text: "Command execution OK",
      color_tag: "success",
      timestamp: "10:15:01",
    });

    const html = renderToStaticMarkup(React.createElement(TerminalViewport));

    expect(html).toContain("Fluffy Core REPL online.");
    expect(html).toContain("Command execution OK");
    expect(html).toContain("system");
    expect(html).toContain("core");
    expect(html).toContain("10:15:00");
  });

  it("renders TerminalInput with active prompt and shortcut hints", () => {
    terminalWsService._simulateState("connected");
    terminalWsService._simulateMessage({
      type: "prompt",
      text: "fluffy> ",
    });

    const html = renderToStaticMarkup(React.createElement(TerminalInput));

    expect(html).toContain("fluffy");
    expect(html).toContain("Enter Core REPL command");
    expect(html).toContain("clear");
  });

  it("renders TerminalToolbar with search and cluster mode badges", () => {
    terminalWsService._simulateMessage({
      type: "status",
      admin_port: 9000,
      client_count: 2,
      mode: "Admin",
    });

    const html = renderToStaticMarkup(
      React.createElement(TerminalToolbar, { searchQuery: "", onSearchChange: vi.fn() })
    );

    expect(html).toContain("Filter terminal output...");
    expect(html).toContain("Mode:");
    expect(html).toContain("Admin");
    expect(html).toContain("Port:");
    expect(html).toContain("9000");
  });

  it("renders AgentNodesView and AgentNodeList with connected nodes", () => {
    terminalWsService._simulateMessage({
      type: "client_list",
      clients: [
        {
          tag: "f1",
          hostname: "OPERATOR-PC",
          os: "Windows",
          os_version: "11 Pro",
          ip: "192.168.1.100",
          arch: "x86_64",
          connected_at: "2026-09-09 00:01:00",
        },
      ],
    });

    const html = renderToStaticMarkup(React.createElement(AgentNodesView));

    expect(html).toContain("Distributed Agent Mesh");
    expect(html).toContain("OPERATOR-PC");
    expect(html).toContain("f1");
    expect(html).toContain("192.168.1.100");
    expect(html).toContain("Windows 11 Pro");
    expect(html).toContain("Set Target");
  });

  it("switches views inside TerminalWorkspace based on activeSidebarView", () => {
    terminalWsService._simulateState("connected");
    uiStore.selectTerminalSection("console");
    let html = renderToStaticMarkup(React.createElement(TerminalWorkspace));
    expect(html).toContain("Core Terminal Ready");

    uiStore.selectTerminalSection("nodes");
    html = renderToStaticMarkup(React.createElement(TerminalWorkspace));
    expect(html).toContain("Distributed Agent Mesh");
  });
});
