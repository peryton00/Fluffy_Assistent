/**
 * Fluffy Desktop - Application Card Component
 * 
 * Compact industrial card representing an installed application.
 * Uses real Base64 icon data from backend with launch and uninstall triggers.
 */

import React, { useState } from "react";
import type { InstalledApp } from "../../../types/contracts";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { appsStore } from "../../../stores/appsStore";
import { PlayIcon, TrashIcon, GridIcon } from "../../../components/common/Icons";

interface ApplicationCardProps {
  app: InstalledApp;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ app }) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);

  const isSelected = selectedItem?.type === "application" && selectedItem?.id === app.id;

  const handleSelect = () => {
    uiStore.setSelectedItem({
      type: "application",
      id: app.id,
      title: app.name,
      data: {
        id: app.id,
        name: app.name,
        publisher: app.publisher || "Unknown",
        version: app.version || "Unknown",
        exe_path: app.exe_path || "N/A",
        location: app.location || "N/A",
        size_kb: app.size_kb ? `${(app.size_kb / 1024).toFixed(1)} MB` : "N/A",
        install_date: app.install_date || "N/A",
        uninstall_string: app.uninstall_string || "N/A",
      },
    }, true);
  };

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLaunching(true);
    try {
      await appsStore.launch(app);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleUninstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUninstalling(true);
    try {
      await appsStore.uninstall(app);
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-label={`Inspect ${app.name}`}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
        border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        cursor: "pointer",
        transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = "var(--color-border-strong)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = "var(--color-border)";
      }}
    >
      {/* Header: Icon & App Info */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        {app.icon_data ? (
          <img
            src={app.icon_data}
            alt={`${app.name} icon`}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-xs)",
              objectFit: "contain",
              backgroundColor: "var(--color-surface-elevated)",
              padding: "2px",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              flexShrink: 0,
            }}
          >
            <GridIcon size={18} />
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            style={{
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {app.name}
          </h3>
          <p
            style={{
              fontSize: "11px",
              color: "var(--color-text-muted)",
              margin: "2px 0 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {app.publisher || "System Application"}
          </p>
          {app.version && (
            <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
              v{app.version}
            </span>
          )}
        </div>
      </div>

      {/* Footer: Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-2)", borderTop: "1px solid var(--color-border-subtle)", gap: "var(--space-2)" }}>
        {app.exe_path && app.exe_path !== "N/A" && app.exe_path.trim() !== "" ? (
          <button
            type="button"
            disabled={isLaunching}
            onClick={handleLaunch}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              fontSize: "10px",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-accent)",
              cursor: isLaunching ? "not-allowed" : "pointer",
            }}
          >
            <PlayIcon size={11} />
            <span>{isLaunching ? "Launching..." : "Launch"}</span>
          </button>
        ) : (
          <span
            style={{
              fontSize: "10px",
              color: "var(--color-text-muted)",
              backgroundColor: "var(--color-surface-subtle)",
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Component / Library
          </span>
        )}

        {app.uninstall_string && (
          <button
            type="button"
            disabled={isUninstalling}
            onClick={handleUninstall}
            title="Uninstall Application"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              padding: "3px 6px",
              fontSize: "10px",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: isUninstalling ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            <TrashIcon size={11} />
            <span>Uninstall</span>
          </button>
        )}
      </div>
    </div>
  );
};
