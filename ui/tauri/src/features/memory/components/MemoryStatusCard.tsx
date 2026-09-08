/**
 * Fluffy Desktop - Memory Status Card
 * 
 * Displays active runtime context state, session metrics, profile size,
 * and quick runtime memory reset controls.
 */

import React, { useState } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import {
  BrainIcon,
  ClockIcon,
  UserIcon,
  BookOpenIcon,
  TrashIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";

export const MemoryStatusCard: React.FC = () => {
  const memory = useMemoryStore();
  const [resetting, setResetting] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const activeSessionId = memory.activeSessionId || "None (idle)";
  const hasActiveIntent = memory.sessionStatus?.active_intent || memory.sessionStatus?.has_context;
  const profileFactsCount = memory.profile?.facts?.length || 0;
  const preferencesCount = Object.keys(memory.preferences).length;

  const handleReset = async () => {
    setResetting(true);
    try {
      await memory.resetRuntimeSession();
      setShowConfirm(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--color-border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ color: "var(--color-accent)", display: "flex" }}><BrainIcon size={16} /></span>
          <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            Runtime Memory State
          </h3>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "2px 8px",
            borderRadius: "var(--radius-xs)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            backgroundColor: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
            border: "1px solid var(--color-accent-border)",
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-accent)" }} />
          Active
        </span>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {/* Active Session */}
        <div style={{ padding: "var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
            <ClockIcon size={12} />
            <span>Active Session</span>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={activeSessionId}>
            {activeSessionId.length > 14 ? `${activeSessionId.slice(0, 14)}...` : activeSessionId}
          </div>
        </div>

        {/* Runtime Intent */}
        <div style={{ padding: "var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
            <BrainIcon size={12} />
            <span>Runtime Intent</span>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)" }}>
            {hasActiveIntent ? (
              <span style={{ color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-accent)" }} />
                Active Intent
              </span>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>Idle / Clear</span>
            )}
          </div>
        </div>

        {/* Learned Facts */}
        <div style={{ padding: "var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
            <UserIcon size={12} />
            <span>Profile Facts</span>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
            {profileFactsCount} learned
          </div>
        </div>

        {/* Preferences */}
        <div style={{ padding: "var(--space-3)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
            <BookOpenIcon size={12} />
            <span>Preferences</span>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
            {preferencesCount} keys
          </div>
        </div>
      </div>

      {/* Confirmation reset prompt */}
      {showConfirm ? (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-danger-subtle)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "var(--radius-xs)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-danger)" }}>
            <AlertTriangleIcon size={14} />
            <span>Reset current multi-turn session context and intent?</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
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
              disabled={resetting}
              onClick={handleReset}
              style={{
                padding: "3px 10px",
                fontSize: "11px",
                fontWeight: "var(--font-weight-bold)",
                backgroundColor: "var(--color-danger)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-xs)",
                cursor: resetting ? "wait" : "pointer",
                opacity: resetting ? 0.6 : 1,
              }}
            >
              {resetting ? "Resetting..." : "Confirm"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-2)", fontSize: "var(--font-size-xs)", borderTop: "1px solid var(--color-border-subtle)" }}>
          <span style={{ color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--color-success)" }}><CheckCircleIcon size={13} /></span>
            Session state synched with Python Brain
          </span>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Reset Intent Context</span>
          </button>
        </div>
      )}
    </div>
  );
};
