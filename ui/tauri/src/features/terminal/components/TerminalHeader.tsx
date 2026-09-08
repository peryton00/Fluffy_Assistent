/**
 * Fluffy Desktop - Terminal Header Component
 * 
 * Domain banner displaying live connection status (CONNECTED / RECONNECTING / DISCONNECTED),
 * active execution target (Local Core vs Remote Agent), and quick actions (Clear / Reconnect).
 */

import React from "react";
import { useTerminalStore, terminalStore } from "../../../stores/terminalStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import {
  TerminalIcon,
  ServerIcon,
  RefreshIcon,
  TrashIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";
import type { TerminalSection } from "../../../types/ui";

export const TerminalHeader: React.FC = () => {
  const connectionState = useTerminalStore((s) => s.connectionState);
  const alterTarget = useTerminalStore((s) => s.alterTarget);
  const clientCount = useTerminalStore((s) => s.clientCount);
  const outputLinesCount = useTerminalStore((s) => s.outputLines.length);

  const activeSection = useUiStore((s) => s.activeSidebarView as TerminalSection);

  const handleSectionChange = (section: TerminalSection) => {
    uiStore.selectTerminalSection(section);
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case "connected":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-success-subtle)",
              color: "var(--color-success)",
              border: "1px solid var(--color-success-border)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-success)" }} />
            CONNECTED
          </span>
        );
      case "reconnecting":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-warning-subtle)",
              color: "var(--color-warning)",
              border: "1px solid var(--color-warning-border)",
            }}
          >
            <RefreshIcon size={11} />
            RECONNECTING...
          </span>
        );
      case "connecting":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-accent-subtle)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent-border)",
            }}
          >
            <RefreshIcon size={11} />
            CONNECTING...
          </span>
        );
      case "error":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-danger-border)",
            }}
          >
            <AlertTriangleIcon size={11} />
            DISCONNECTED
          </span>
        );
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-text-muted)" }} />
            DISCONNECTED
          </span>
        );
    }
  };

  return (
    <header
      style={{
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "var(--space-4) var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Top Banner Row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TerminalIcon size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                Core Terminal
              </h1>
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-muted)",
                }}
              >
                ws://127.0.0.1:9003
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "3px 0 0" }}>
              Full-duplex Rust Core interactive REPL and distributed LAN agent command bridge.
            </p>
          </div>
        </div>

        {/* State Badges & Actions */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {/* Connection State Badge */}
          {getConnectionBadge()}

          {/* Active Target Indicator */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            <ServerIcon size={12} />
            <span>Target:</span>
            {alterTarget ? (
              <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-accent)" }}>Agent [{alterTarget}]</span>
            ) : (
              <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>Local Core</span>
            )}
          </div>

          {/* Buffer count */}
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", padding: "0 var(--space-1)" }}>
            {outputLinesCount} lines
          </span>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={() => terminalStore.clearOutput()}
            title="Clear output viewport (Ctrl+L)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={() => terminalStore.reconnect()}
            title="Reconnect WebSocket"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <RefreshIcon size={12} />
            <span>Reconnect</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          borderTop: "1px solid var(--color-border-subtle)",
          paddingTop: "var(--space-2)",
        }}
      >
        <button
          type="button"
          onClick={() => handleSectionChange("console")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "var(--radius-xs)",
            fontSize: "var(--font-size-xs)",
            fontWeight: activeSection === "console" || !activeSection ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
            backgroundColor: activeSection === "console" || !activeSection ? "var(--color-accent-subtle)" : "transparent",
            color: activeSection === "console" || !activeSection ? "var(--color-accent)" : "var(--color-text-muted)",
            border: activeSection === "console" || !activeSection ? "1px solid var(--color-accent-border)" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <TerminalIcon size={14} />
          Local Console
        </button>

        <button
          type="button"
          onClick={() => handleSectionChange("nodes")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "var(--radius-xs)",
            fontSize: "var(--font-size-xs)",
            fontWeight: activeSection === "nodes" ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
            backgroundColor: activeSection === "nodes" ? "var(--color-accent-subtle)" : "transparent",
            color: activeSection === "nodes" ? "var(--color-accent)" : "var(--color-text-muted)",
            border: activeSection === "nodes" ? "1px solid var(--color-accent-border)" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <ServerIcon size={14} />
          Agent Nodes
          {clientCount > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                padding: "1px 5px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-border)",
              }}
            >
              {clientCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
