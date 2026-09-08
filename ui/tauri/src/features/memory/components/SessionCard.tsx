/**
 * Fluffy Desktop - Session Card
 * 
 * Card representing a saved conversation memory session.
 */

import React, { useState } from "react";
import {
  TrashIcon,
  MessageSquareIcon,
  CalendarIcon,
} from "../../../components/common/Icons";
import type { ChatSessionSummary } from "../../../types/contracts";

interface SessionCardProps {
  session: ChatSessionSummary;
  isActive?: boolean;
  onSelect: (session: ChatSessionSummary) => void;
  onDelete: (id: string) => Promise<void>;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isActive = false,
  onSelect,
  onDelete,
}) => {
  const [deleting, setDeleting] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete(session.id);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  const formatDate = (val?: string | number) => {
    if (!val) return "Unknown";
    try {
      const d = typeof val === "number" ? new Date(val * 1000) : new Date(val);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(val);
    }
  };

  return (
    <div
      onClick={() => onSelect(session)}
      style={{
        backgroundColor: "var(--color-surface)",
        border: isActive ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        transition: "all 0.15s ease",
        boxShadow: isActive ? "0 0 0 1px var(--color-accent-border)" : "none",
      }}
    >
      {/* Top row: Title and Badges */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-xs)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: isActive ? "var(--color-accent-subtle)" : "var(--color-surface-elevated)",
              color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
              border: `1px solid ${isActive ? "var(--color-accent-border)" : "var(--color-border)"}`,
            }}
          >
            <MessageSquareIcon size={14} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.title || `Session ${session.id.slice(0, 8)}`}
              </h4>
              {isActive && (
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: "var(--color-accent-subtle)",
                    color: "var(--color-accent)",
                    border: "1px solid var(--color-accent-border)",
                  }}
                >
                  Active
                </span>
              )}
            </div>
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              ID: {session.id}
            </span>
          </div>
        </div>

        {/* Message count badge */}
        <span
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            padding: "2px 6px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {session.message_count ?? 0} msgs
        </span>
      </div>

      {/* Timestamps */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "var(--color-text-muted)",
          paddingTop: "var(--space-2)",
          borderTop: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <CalendarIcon size={12} />
          <span>Updated: {formatDate(session.last_updated || session.created)}</span>
        </div>

        {showConfirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              style={{
                padding: "2px 6px",
                fontSize: "10px",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              style={{
                padding: "2px 8px",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                backgroundColor: "var(--color-danger)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-xs)",
                cursor: deleting ? "wait" : "pointer",
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: "2px",
            }}
            title="Delete session"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
