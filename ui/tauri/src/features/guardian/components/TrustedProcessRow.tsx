/**
 * Fluffy Desktop - Trusted Process Row Component
 *
 * Displays an individual process in the Guardian whitelist table.
 * Supports Inspector binding and untrust/removal trigger.
 */

import React, { useState } from "react";
import { guardianStore } from "../../../stores/guardianStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { ShieldCheckIcon, TrashIcon } from "../../../components/common/Icons";

export interface TrustedProcessRowProps {
  processName: string;
  onRemove?: (processName: string) => Promise<void> | void;
  onSelect?: (processName: string) => void;
}

export const TrustedProcessRow: React.FC<TrustedProcessRowProps> = ({
  processName,
  onRemove,
  onSelect,
}) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isRemoving, setIsRemoving] = useState(false);

  const isSelected = selectedItem?.type === "trustedProcess" && selectedItem?.id === processName;

  const handleSelect = () => {
    if (onSelect) {
      onSelect(processName);
      return;
    }
    uiStore.setSelectedItem(
      {
        type: "trustedProcess",
        id: processName,
        title: `Trusted: ${processName}`,
        data: {
          process_name: processName,
          status: "WHITELISTED",
          policy: "Exempt from anomaly auto-mitigation",
        },
      },
      true
    );
  };

  const handleUntrust = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRemoving(true);
    try {
      if (onRemove) {
        await onRemove(processName);
      } else {
        await guardianStore.removeTrusted(processName);
      }
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div
      onClick={handleSelect}
      style={{
        padding: "var(--space-2) var(--space-3)",
        backgroundColor: "var(--color-surface)",
        border: `1px solid ${isSelected ? "color-mix(in srgb, var(--color-success) 50%, transparent)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-xs)",
        boxShadow: isSelected ? "0 0 0 1px color-mix(in srgb, var(--color-success) 25%, transparent)" : "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        fontSize: "var(--font-size-xs)",
        transition: "border-color var(--transition-fast)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
        <span style={{ color: "var(--color-success)", display: "flex", flexShrink: 0 }}>
          <ShieldCheckIcon size={14} />
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {processName}
        </span>
        <span
          style={{
            fontSize: "10px",
            fontWeight: "var(--font-weight-bold)",
            textTransform: "uppercase",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            color: "var(--color-success)",
            border: "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
            flexShrink: 0,
          }}
        >
          Whitelisted
        </span>
      </div>

      <button
        type="button"
        disabled={isRemoving}
        onClick={handleUntrust}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "3px 10px",
          fontSize: "var(--font-size-xs)",
          fontWeight: "var(--font-weight-medium)",
          backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
          borderRadius: "var(--radius-xs)",
          color: "var(--color-danger)",
          cursor: isRemoving ? "wait" : "pointer",
          opacity: isRemoving ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <TrashIcon size={12} />
        <span>{isRemoving ? "Removing..." : "Remove"}</span>
      </button>
    </div>
  );
};
