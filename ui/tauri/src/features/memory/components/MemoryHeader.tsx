/**
 * Fluffy Desktop - Memory Header
 * 
 * Header and sub-navigation tabs for the Memory workspace.
 */

import React from "react";
import { useUIStore } from "../../../stores/uiStore";
import { useMemoryStore } from "../../../stores/memoryStore";
import {
  BrainIcon,
  BookOpenIcon,
  UserIcon,
  RefreshIcon,
  ClockIcon,
} from "../../../components/common/Icons";
import type { MemorySection } from "../../../types/ui";

export const MemoryHeader: React.FC = () => {
  const { memorySection, selectMemorySection } = useUIStore();
  const memory = useMemoryStore();

  const sections: { id: MemorySection; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    { id: "overview", label: "Overview", icon: <BrainIcon size={14} /> },
    {
      id: "sessions",
      label: "Sessions",
      icon: <ClockIcon size={14} />,
      badge: memory.sessions.length > 0 ? memory.sessions.length : undefined,
    },
    {
      id: "profile",
      label: "Long-Term Profile",
      icon: <UserIcon size={14} />,
      badge: memory.profile?.facts?.length ? `${memory.profile.facts.length} facts` : undefined,
    },
    {
      id: "preferences",
      label: "Preferences",
      icon: <BookOpenIcon size={14} />,
      badge: Object.keys(memory.preferences).length > 0 ? Object.keys(memory.preferences).length : undefined,
    },
    {
      id: "knowledge",
      label: "Knowledge",
      icon: <BookOpenIcon size={14} />,
    },
  ];

  const handleRefresh = async () => {
    await Promise.all([
      memory.loadProfile(true),
      memory.loadPreferences(true),
      memory.loadSessions(true),
      memory.loadActiveSession(),
    ]);
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
      {/* Top Banner */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BrainIcon size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                Context &amp; Memory Architecture
              </h1>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                  border: "1px solid var(--color-accent-border)",
                }}
              >
                Persistent Store
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "3px 0 0" }}>
              Multi-tier state: Active session runtime &bull; Long-term user profile &bull; Structured preferences &bull; Knowledge index
            </p>
          </div>
        </div>

        {/* Action button */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            disabled={memory.loading}
            onClick={handleRefresh}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              cursor: memory.loading ? "wait" : "pointer",
              opacity: memory.loading ? 0.6 : 1,
            }}
          >
            <RefreshIcon size={12} />
            <span>{memory.loading ? "Syncing..." : "Sync Memory"}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          borderTop: "1px solid var(--color-border-subtle)",
          paddingTop: "var(--space-3)",
          overflowX: "auto",
        }}
      >
        {sections.map((sec) => {
          const isSelected = memorySection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => selectMemorySection(sec.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                fontWeight: isSelected ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
                backgroundColor: isSelected ? "var(--color-accent-subtle)" : "transparent",
                color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)",
                border: isSelected ? "1px solid var(--color-accent-border)" : "1px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              {sec.icon}
              <span>{sec.label}</span>
              {sec.badge !== undefined && (
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    padding: "1px 5px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
                    color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {sec.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
