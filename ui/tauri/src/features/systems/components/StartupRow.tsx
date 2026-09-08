/**
 * Fluffy Desktop - Startup Row Component
 * 
 * Renders an individual startup entry with explicit enabled/disabled status switch,
 * source badge, and remove action.
 */

import React, { useState } from "react";
import type { StartupApp } from "../../../types/contracts";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { toggleStartupApp, removeStartupApp } from "../../../services/api/systems";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { TrashIcon, LayersIcon } from "../../../components/common/Icons";

interface StartupRowProps {
  entry: StartupApp;
}

export const StartupRow: React.FC<StartupRowProps> = ({ entry }) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isToggling, setIsToggling] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const isSelected = selectedItem?.type === "startup" && selectedItem?.id === entry.name;

  const handleSelect = () => {
    uiStore.setSelectedItem({
      type: "startup",
      id: entry.name,
      title: `Startup: ${entry.name}`,
      data: {
        name: entry.name,
        command: entry.command,
        enabled: entry.enabled ? "Enabled" : "Disabled",
        source: entry.source || (entry.command?.includes("Startup") ? "Startup Folder" : "Windows Registry"),
      },
    }, true);
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      await toggleStartupApp(entry.name, !entry.enabled);
      await telemetryCoordinator.refreshNow();
    } finally {
      setIsToggling(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRemoving(true);
    try {
      await removeStartupApp(entry.name);
      await telemetryCoordinator.refreshNow();
    } finally {
      setIsRemoving(false);
    }
  };

  const isFolder = entry.command?.toLowerCase().includes("startup");
  const sourceLabel = entry.source || (isFolder ? "Startup Folder" : "Registry");

  return (
    <tr
      onClick={handleSelect}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "transparent",
        cursor: "pointer",
        transition: "background-color var(--transition-fast)",
        borderBottom: "1px solid var(--color-border-subtle)",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Name */}
      <td style={{ padding: "8px 12px", color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: "var(--color-accent)" }}><LayersIcon size={14} /></span>
          <span>{entry.name}</span>
        </div>
      </td>

      {/* Command / Executable Path */}
      <td style={{ padding: "8px 12px", color: "var(--color-text-muted)", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.command}
      </td>

      {/* Source */}
      <td style={{ padding: "8px 12px", width: "120px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: "var(--font-weight-medium)",
            padding: "2px 6px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-secondary)",
          }}
        >
          {sourceLabel}
        </span>
      </td>

      {/* Status Toggle Switch */}
      <td style={{ padding: "8px 12px", width: "110px" }}>
        <button
          type="button"
          disabled={isToggling}
          onClick={handleToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "2px 8px",
            fontSize: "10px",
            fontWeight: "var(--font-weight-bold)",
            borderRadius: "var(--radius-xs)",
            backgroundColor: entry.enabled ? "rgba(16, 185, 129, 0.12)" : "var(--color-surface-elevated)",
            border: `1px solid ${entry.enabled ? "rgba(16, 185, 129, 0.3)" : "var(--color-border)"}`,
            color: entry.enabled ? "var(--color-success)" : "var(--color-text-muted)",
            cursor: isToggling ? "not-allowed" : "pointer",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: entry.enabled ? "var(--color-success)" : "var(--color-text-muted)",
            }}
          />
          <span>{isToggling ? "Saving..." : entry.enabled ? "Enabled" : "Disabled"}</span>
        </button>
      </td>

      {/* Action: Remove */}
      <td style={{ padding: "8px 12px", width: "60px", textAlign: "center" }}>
        <button
          type="button"
          disabled={isRemoving}
          onClick={handleRemove}
          title={`Remove startup entry ${entry.name}`}
          aria-label={`Remove startup entry ${entry.name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: isRemoving ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <TrashIcon size={12} />
        </button>
      </td>
    </tr>
  );
};
