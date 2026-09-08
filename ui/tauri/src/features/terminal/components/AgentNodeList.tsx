/**
 * Fluffy Desktop - Agent Node List Component
 * 
 * Renders connected distributed agent nodes from the Core client_list.
 * Supports Inspector binding and active alter target switching.
 */

import React from "react";
import { useTerminalStore, terminalStore } from "../../../stores/terminalStore";
import { uiStore } from "../../../stores/uiStore";
import {
  ServerIcon,
  CheckCircleIcon,
  ZapIcon,
  InfoIcon,
} from "../../../components/common/Icons";
import type { TerminalClientNode } from "../../../types/contracts";

export const AgentNodeList: React.FC = () => {
  const clients = useTerminalStore((s) => s.clients);
  const alterTarget = useTerminalStore((s) => s.alterTarget);

  const handleSelectNode = (node: TerminalClientNode) => {
    uiStore.setInspectorItem({
      id: `node-${node.tag}`,
      type: "agentNode",
      title: `Agent Node: ${node.tag} (${node.hostname})`,
      data: node as unknown as Record<string, unknown>,
    });
  };

  const handleSwitchTarget = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (alterTarget === tag) {
      terminalStore.setAlterTarget(null);
    } else {
      terminalStore.setAlterTarget(tag);
    }
  };

  if (clients.length === 0) {
    return (
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-8) var(--space-4)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
          }}
        >
          <ServerIcon size={24} />
        </div>
        <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
          No Agent Nodes Connected
        </h3>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", maxWidth: "420px", margin: 0, lineHeight: 1.5 }}>
          There are currently no remote client agents attached to this Core instance.
          Client agents connect via <code>client --start &lt;ip&gt; --port &lt;port&gt;</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {clients.map((node) => {
          const isTarget = alterTarget === node.tag;

          return (
            <div
              key={node.tag}
              onClick={() => handleSelectNode(node)}
              style={{
                backgroundColor: "var(--color-surface)",
                border: isTarget ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                cursor: "pointer",
                boxShadow: isTarget ? "0 0 0 1px var(--color-accent-border)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <div>
                {/* Header: Tag, Hostname, Active Target Badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)", paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "var(--radius-xs)",
                        backgroundColor: "var(--color-accent-subtle)",
                        border: "1px solid var(--color-accent-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-accent)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: "var(--font-weight-bold)",
                        fontSize: "var(--font-size-xs)",
                      }}
                    >
                      {node.tag}
                    </div>
                    <div>
                      <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                        {node.hostname}
                      </h4>
                      <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                        {node.ip}
                      </span>
                    </div>
                  </div>

                  {isTarget && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-xs)",
                        fontSize: "9px",
                        fontWeight: "var(--font-weight-bold)",
                        backgroundColor: "var(--color-accent-subtle)",
                        color: "var(--color-accent)",
                        border: "1px solid var(--color-accent-border)",
                      }}
                    >
                      <CheckCircleIcon size={10} />
                      ACTIVE TARGET
                    </span>
                  )}
                </div>

                {/* Specs */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-3)",
                    fontSize: "var(--font-size-xs)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "10px", display: "block" }}>Operating System</span>
                    <span style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {node.os} {node.os_version}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "10px", display: "block" }}>Architecture</span>
                    <span style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {node.arch || "x86_64"}
                    </span>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "10px", display: "block" }}>Connected Since</span>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>{node.connected_at}</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border-subtle)" }}>
                <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <InfoIcon size={12} />
                  Click to inspect
                </span>

                <button
                  type="button"
                  onClick={(e) => handleSwitchTarget(e, node.tag)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: isTarget ? "var(--color-surface-elevated)" : "var(--color-accent)",
                    color: isTarget ? "var(--color-text)" : "#ffffff",
                    border: isTarget ? "1px solid var(--color-border)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <ZapIcon size={12} />
                  {isTarget ? "Reset to Local" : "Set Target"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
