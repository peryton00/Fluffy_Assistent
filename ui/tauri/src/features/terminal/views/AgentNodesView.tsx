/**
 * Fluffy Desktop - Agent Nodes View
 * 
 * Distributed client nodes manager.
 * Displays all connected remote agents attached to Fluffy Core's admin port.
 */

import React from "react";
import { useTerminalStore } from "../../../stores/terminalStore";
import { AgentNodeList } from "../components/AgentNodeList";
import { ServerIcon } from "../../../components/common/Icons";

export const AgentNodesView: React.FC = () => {
  const clientCount = useTerminalStore((s) => s.clientCount);
  const alterTarget = useTerminalStore((s) => s.alterTarget);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Overview Banner */}
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-4)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ color: "var(--color-accent)", display: "flex" }}><ServerIcon size={18} /></span>
            <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
              Distributed Agent Mesh
            </h2>
          </div>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0", maxWidth: "600px" }}>
            Fluffy Core coordinates client agents across your local network. Selecting an active target
            reroutes commands entered in the terminal REPL directly to that remote node.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--color-text-muted)", display: "block", fontSize: "10px" }}>Connected Nodes</span>
            <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>{clientCount}</span>
          </div>

          <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--color-text-muted)", display: "block", fontSize: "10px" }}>Active Target</span>
            <span style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)" }}>{alterTarget ? `Agent [${alterTarget}]` : "Local Core"}</span>
          </div>
        </div>
      </div>

      {/* Nodes Grid */}
      <AgentNodeList />
    </div>
  );
};
