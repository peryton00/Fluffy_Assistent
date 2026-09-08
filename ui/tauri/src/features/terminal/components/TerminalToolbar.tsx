/**
 * Fluffy Desktop - Terminal Toolbar Component
 * 
 * Secondary controls for search filtering terminal output, mode information,
 * and quick target reset.
 */

import React from "react";
import { useTerminalStore, terminalStore } from "../../../stores/terminalStore";
import { SearchIcon, ServerIcon, LayersIcon } from "../../../components/common/Icons";

export interface TerminalToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  const mode = useTerminalStore((s) => s.mode);
  const adminPort = useTerminalStore((s) => s.adminPort);
  const alterTarget = useTerminalStore((s) => s.alterTarget);

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "var(--space-2) var(--space-4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      {/* Search Output Filter */}
      <div style={{ position: "relative", flex: 1, maxWidth: "420px" }}>
        <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
          <SearchIcon size={13} />
        </span>
        <input
          type="text"
          placeholder="Filter terminal output..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            paddingLeft: "30px",
            paddingRight: "10px",
            paddingTop: "4px",
            paddingBottom: "4px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
        />
      </div>

      {/* Cluster Meta & Reset Alter Target */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {/* Mode Tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "3px 8px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
          }}
        >
          <span style={{ color: "var(--color-accent)", display: "flex" }}><LayersIcon size={12} /></span>
          <span>Mode: <strong style={{ color: "var(--color-text)" }}>{mode}</strong></span>
        </div>

        {/* Admin Port */}
        {adminPort && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              backgroundColor: "var(--color-surface-elevated)",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
            }}
          >
            <span>Port: <strong style={{ color: "var(--color-text)" }}>{adminPort}</strong></span>
          </div>
        )}

        {/* Clear Alter Target if altered */}
        {alterTarget && (
          <button
            type="button"
            onClick={() => terminalStore.setAlterTarget(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              borderRadius: "var(--radius-xs)",
              fontSize: "11px",
              color: "var(--color-accent)",
              cursor: "pointer",
            }}
          >
            <ServerIcon size={12} />
            Reset to Local
          </button>
        )}
      </div>
    </div>
  );
};
