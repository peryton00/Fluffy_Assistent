/**
 * Fluffy Desktop - Preference Row
 * 
 * Key-value row for user and system memory preferences with inline editing.
 */

import React, { useState } from "react";
import {
  TagIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "../../../components/common/Icons";

interface PreferenceRowProps {
  prefKey: string;
  value: unknown;
  onUpdate: (key: string, value: unknown) => Promise<void>;
  onSelect: (key: string, value: unknown) => void;
}

export const PreferenceRow: React.FC<PreferenceRowProps> = ({
  prefKey,
  value,
  onUpdate,
  onSelect,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editValue, setEditValue] = useState<string>(
    typeof value === "object" ? JSON.stringify(value) : String(value ?? "")
  );
  const [saving, setSaving] = useState<boolean>(false);

  const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaving(true);
    try {
      let parsedValue: unknown = editValue;
      try {
        parsedValue = JSON.parse(editValue);
      } catch {
        parsedValue = editValue;
      }
      await onUpdate(prefKey, parsedValue);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(displayValue);
    setIsEditing(false);
  };

  return (
    <div
      onClick={() => onSelect(prefKey, value)}
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0, flex: 1 }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--color-accent)",
          }}
        >
          <TagIcon size={14} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prefKey}
          </div>
          {isEditing ? (
            <form onSubmit={handleSave} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text)",
                  outline: "none",
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "4px 8px",
                  backgroundColor: "var(--color-success)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  cursor: saving ? "wait" : "pointer",
                }}
                title="Save preference"
              >
                <CheckCircleIcon size={12} />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "4px 8px",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-muted)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
                title="Cancel"
              >
                <XCircleIcon size={12} />
              </button>
            </form>
          ) : (
            <div
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text)",
                marginTop: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                backgroundColor: "var(--color-surface-elevated)",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-border-subtle)",
                display: "inline-block",
                maxWidth: "100%",
              }}
            >
              {displayValue || <span style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>empty</span>}
            </div>
          )}
        </div>
      </div>

      {!isEditing && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
};
