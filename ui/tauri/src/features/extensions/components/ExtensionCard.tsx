/**
 * Fluffy Desktop - Extension Card Component
 * 
 * Renders an installed extension item with operational status badges and action controls.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import type { ExtensionSummary } from "../../../types/contracts";
import {
  PuzzleIcon,
  PlayIcon,
  CodeIcon,
  GlobeIcon,
  RefreshCwIcon,
  TrashIcon,
  FolderIcon,
  CheckIcon,
  XCircleIcon,
} from "../../../components/common/Icons";

interface ExtensionCardProps {
  extension: ExtensionSummary;
  isSelected: boolean;
  onSelect: (intent: string) => void;
  onToggle: (intent: string) => void;
  onReload: (intent: string) => void;
  onViewCode: (intent: string) => void;
  onViewUi: (intent: string) => void;
  onOpenVsCode: (intent: string) => void;
  onDelete: (intent: string) => void;
  isActionLoading?: boolean;
}

export const ExtensionCard: React.FC<ExtensionCardProps> = ({
  extension,
  isSelected,
  onSelect,
  onToggle,
  onReload,
  onViewCode,
  onViewUi,
  onOpenVsCode,
  onDelete,
  isActionLoading = false,
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(extension.intent)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(extension.intent);
        }
      }}
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s ease",
        boxShadow: isSelected ? "0 0 0 1px var(--color-accent)" : "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <PuzzleIcon size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <h4
                style={{
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {extension.name || extension.intent}
              </h4>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                v{extension.version || "1.0"}
              </span>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                margin: "2px 0 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {extension.intent}
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {extension.has_ui && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent-border)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              <GlobeIcon size={10} />
              UI
            </span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: extension.enabled ? "var(--color-success-subtle)" : "var(--color-surface-elevated)",
              color: extension.enabled ? "var(--color-success)" : "var(--color-text-muted)",
              border: extension.enabled ? "1px solid var(--color-success-border)" : "1px solid var(--color-border)",
            }}
          >
            {extension.enabled ? (
              <>
                <CheckIcon size={10} />
                Active
              </>
            ) : (
              <>
                <XCircleIcon size={10} />
                Disabled
              </>
            )}
          </span>
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-muted)",
          margin: 0,
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {extension.description || "No description provided for this extension."}
      </p>

      {/* Meta info & Action Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "var(--space-2)",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: "11px",
          color: "var(--color-text-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ textTransform: "capitalize", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
            {extension.language || "python"}
          </span>
          {extension.author && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
              by {extension.author}
            </span>
          )}
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={extension.enabled ? "Disable Extension" : "Enable Extension"}
            onClick={() => onToggle(extension.intent)}
            disabled={isActionLoading}
            style={{
              padding: "4px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
              backgroundColor: "transparent",
              color: extension.enabled ? "var(--color-success)" : "var(--color-text-muted)",
              cursor: isActionLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PlayIcon size={12} />
          </button>

          <button
            type="button"
            title="Inspect Code"
            onClick={() => onViewCode(extension.intent)}
            style={{
              padding: "4px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CodeIcon size={12} />
          </button>

          {extension.has_ui && (
            <button
              type="button"
              title="Open Web UI"
              onClick={() => onViewUi(extension.intent)}
              style={{
                padding: "4px 6px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-accent-border)",
                backgroundColor: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GlobeIcon size={12} />
            </button>
          )}

          <button
            type="button"
            title="Reload in Runtime"
            onClick={() => onReload(extension.intent)}
            disabled={isActionLoading}
            style={{
              padding: "4px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              cursor: isActionLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RefreshCwIcon size={12} />
          </button>

          <button
            type="button"
            title="Open Folder in VS Code"
            onClick={() => onOpenVsCode(extension.intent)}
            style={{
              padding: "4px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FolderIcon size={12} />
          </button>

          <button
            type="button"
            title="Delete Extension"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete extension '${extension.name || extension.intent}'?`)) {
                onDelete(extension.intent);
              }
            }}
            disabled={isActionLoading}
            style={{
              padding: "4px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
              backgroundColor: "transparent",
              color: "var(--color-danger)",
              cursor: isActionLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
