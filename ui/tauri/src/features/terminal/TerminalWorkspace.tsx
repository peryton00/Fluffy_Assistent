/**
 * Fluffy Desktop - Terminal Workspace Root Router
 * 
 * Top-level view container for Phase 6: Core Terminal.
 * Connects to ws://127.0.0.1:9003 and routes between Local Console and Agent Nodes views.
 */

import React, { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { terminalStore } from "../../stores/terminalStore";
import { TerminalHeader } from "./components/TerminalHeader";
import { LocalConsoleView } from "./views/LocalConsoleView";
import { AgentNodesView } from "./views/AgentNodesView";

export const TerminalWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  // Connect to terminal WebSocket on mount
  useEffect(() => {
    terminalStore.connect();
  }, []);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      {/* Persistent Terminal Header */}
      <TerminalHeader />

      {/* Subview Routing */}
      {activeSidebarView === "nodes" ? (
        <AgentNodesView />
      ) : (
        <LocalConsoleView />
      )}
    </div>
  );
};
