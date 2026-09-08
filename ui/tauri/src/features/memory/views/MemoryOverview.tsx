/**
 * Fluffy Desktop - Memory Overview View
 * 
 * High-level memory architecture dashboard presenting active session runtime,
 * long-term profile preview, and preference summary.
 */

import React, { useEffect } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useUIStore } from "../../../stores/uiStore";
import { MemoryStatusCard } from "../components/MemoryStatusCard";
import { SessionCard } from "../components/SessionCard";
import {
  UserIcon,
  BookOpenIcon,
  ClockIcon,
  CheckCircleIcon,
  InfoIcon,
} from "../../../components/common/Icons";

export const MemoryOverview: React.FC = () => {
  const memory = useMemoryStore();
  const { setInspectorItem, selectMemorySection } = useUIStore();

  useEffect(() => {
    memory.loadProfile();
    memory.loadPreferences();
    memory.loadSessions();
    memory.loadActiveSession();
  }, []);

  const facts = memory.profile?.facts || [];
  const frequentApps = memory.profile?.frequent_apps || [];
  const recentSessions = memory.sessions.slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Top Runtime Status */}
      <MemoryStatusCard />

      {/* Grid: Long-Term Profile Highlights & Preferences Preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {/* Profile Highlights */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: "var(--space-2)",
                borderBottom: "1px solid var(--color-border-subtle)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}><UserIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
                  Long-Term Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectMemorySection("profile")}
                style={{
                  fontSize: "11px",
                  color: "var(--color-accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                View Details &rarr;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "var(--font-size-xs)",
                  padding: "var(--space-2) var(--space-3)",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                <span style={{ color: "var(--color-text-muted)" }}>User Identity:</span>
                <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                  {memory.profile?.name || "Default Operator"}
                </span>
              </div>

              {/* Facts Summary */}
              <div>
                <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                  Learned Facts:
                </span>
                {facts.length === 0 ? (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "var(--space-3)", textAlign: "center", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
                    No custom facts learned yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
                    {facts.slice(0, 3).map((f, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: "var(--font-size-xs)",
                          padding: "var(--space-2)",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: "var(--color-surface-elevated)",
                          border: "1px solid var(--color-border-subtle)",
                          color: "var(--color-text)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "6px",
                        }}
                      >
                        <span style={{ color: "var(--color-accent)", marginTop: "2px", display: "flex" }}><CheckCircleIcon size={12} /></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Frequent Apps */}
              {frequentApps.length > 0 && (
                <div>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                    Frequent Applications:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {frequentApps.map((app) => (
                      <span
                        key={app}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-xs)",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          backgroundColor: "var(--color-surface-elevated)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                        }}
                      >
                        {app}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--color-text-muted)",
            }}
          >
            <span>Stored in <code>/memory</code> JSON persistence.</span>
            <button
              type="button"
              onClick={() => selectMemorySection("profile")}
              style={{
                padding: "3px 8px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Preferences Preview */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: "var(--space-2)",
                borderBottom: "1px solid var(--color-border-subtle)",
                marginBottom: "var(--space-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}><BookOpenIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
                  System Preferences
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectMemorySection("preferences")}
                style={{
                  fontSize: "11px",
                  color: "var(--color-accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                Manage All ({Object.keys(memory.preferences).length}) &rarr;
              </button>
            </div>

            {Object.keys(memory.preferences).length === 0 ? (
              <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <InfoIcon size={20} />
                <span>No custom preferences configured. Defaults applied.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                {Object.entries(memory.preferences).slice(0, 4).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>{k}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--color-text-muted)",
            }}
          >
            <span>Read/written via <code>/memory/preferences</code>.</span>
            <button
              type="button"
              onClick={() => selectMemorySection("preferences")}
              style={{
                padding: "3px 8px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Add Preference
            </button>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "var(--space-2)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ color: "var(--color-accent)", display: "flex" }}><ClockIcon size={16} /></span>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
              Conversation Memory Sessions
            </h3>
          </div>
          <button
            type="button"
            onClick={() => selectMemorySection("sessions")}
            style={{
              fontSize: "11px",
              color: "var(--color-accent)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            View All ({memory.sessions.length}) &rarr;
          </button>
        </div>

        {recentSessions.length === 0 ? (
          <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
            No saved conversation memory sessions found.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {recentSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                isActive={s.id === memory.activeSessionId}
                onSelect={(selected) =>
                  setInspectorItem({
                    id: selected.id,
                    type: "memorySession",
                    title: `Session: ${selected.title || selected.id}`,
                    data: selected,
                  })
                }
                onDelete={(id) => memory.removeSession(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
