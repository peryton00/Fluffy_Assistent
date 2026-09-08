/**
 * Fluffy Desktop - Long Term Profile View
 * 
 * Manages long-term learned user facts, preferences, identity,
 * and frequent application associations.
 */

import React, { useState, useEffect } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  UserIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  RefreshIcon,
  InfoIcon,
} from "../../../components/common/Icons";

export const LongTermProfileView: React.FC = () => {
  const memory = useMemoryStore();
  const { setInspectorItem } = useUIStore();

  const [userName, setUserName] = useState<string>(memory.profile?.name || "");
  const [newFact, setNewFact] = useState<string>("");
  const [newApp, setNewApp] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    memory.loadProfile();
  }, []);

  useEffect(() => {
    if (memory.profile?.name) {
      setUserName(memory.profile.name);
    }
  }, [memory.profile]);

  const facts = memory.profile?.facts || [];
  const frequentApps = memory.profile?.frequent_apps || [];

  const handleSaveName = async () => {
    setSaving(true);
    try {
      await memory.saveProfile({
        ...memory.profile,
        name: userName.trim() || undefined,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    setSaving(true);
    try {
      const updatedFacts = [...facts, newFact.trim()];
      await memory.saveProfile({
        ...memory.profile,
        facts: updatedFacts,
      });
      setNewFact("");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFact = async (index: number) => {
    setSaving(true);
    try {
      const updatedFacts = facts.filter((_, i) => i !== index);
      await memory.saveProfile({
        ...memory.profile,
        facts: updatedFacts,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApp.trim()) return;
    setSaving(true);
    try {
      const updatedApps = Array.from(new Set([...frequentApps, newApp.trim()]));
      await memory.saveProfile({
        ...memory.profile,
        frequent_apps: updatedApps,
      });
      setNewApp("");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApp = async (app: string) => {
    setSaving(true);
    try {
      const updatedApps = frequentApps.filter((a) => a !== app);
      await memory.saveProfile({
        ...memory.profile,
        frequent_apps: updatedApps,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* User Identity Banner */}
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
            <span style={{ color: "var(--color-accent)", display: "flex" }}><UserIcon size={16} /></span>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
              Operator Identity
            </h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {savedSuccess && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success)", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircleIcon size={13} />
                Saved
              </span>
            )}
            <button
              type="button"
              disabled={memory.loading}
              onClick={() => memory.loadProfile(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "11px",
                cursor: memory.loading ? "wait" : "pointer",
                opacity: memory.loading ? 0.6 : 1,
              }}
            >
              <RefreshIcon size={11} />
              <span>Reload</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-3)" }}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
              Operator / Profile Display Name:
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g., Alex, DevOps Engineer..."
              style={{
                width: "100%",
                padding: "6px 12px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-xs)",
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveName}
            style={{
              padding: "6px 14px",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-bold)",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Update Identity"}
          </button>
        </div>
      </div>

      {/* 2-Column: Learned Facts & Frequent Apps */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {/* Learned Facts */}
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
              <div>
                <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                  Learned Behavioral Facts
                </h4>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                  Long-term context retained across agent sessions.
                </p>
              </div>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                {facts.length} facts
              </span>
            </div>

            {/* Add Fact Form */}
            <form onSubmit={handleAddFact} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-3)" }}>
              <input
                type="text"
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder="Add new user fact (e.g. 'Prefers dark themes')..."
                style={{
                  flex: 1,
                  padding: "5px 10px",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--color-text)",
                  fontSize: "11px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={saving || !newFact.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  backgroundColor: "var(--color-accent)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-bold)",
                  cursor: saving || !newFact.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !newFact.trim() ? 0.6 : 1,
                }}
              >
                <PlusIcon size={12} />
                Add
              </button>
            </form>

            {/* Facts List */}
            {facts.length === 0 ? (
              <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
                No custom behavioral facts recorded.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "280px", overflowY: "auto" }}>
                {facts.map((fact, idx) => (
                  <div
                    key={idx}
                    onClick={() =>
                      setInspectorItem({
                        id: `fact-${idx}`,
                        type: "memoryProfile",
                        title: `Learned Fact #${idx + 1}`,
                        data: { index: idx, fact },
                      })
                    }
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-text)",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", minWidth: 0 }}>
                      <span style={{ color: "var(--color-accent)", marginTop: "2px", display: "flex" }}><CheckCircleIcon size={12} /></span>
                      <span style={{ wordBreak: "break-word" }}>{fact}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFact(idx);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--color-text-muted)",
                        cursor: "pointer",
                        padding: "2px",
                      }}
                      title="Remove fact"
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ paddingTop: "var(--space-2)", borderTop: "1px solid var(--color-border-subtle)", fontSize: "10px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
            <InfoIcon size={12} />
            Facts are automatically injected into prompt context during chat.
          </div>
        </div>

        {/* Frequent Applications */}
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
              <div>
                <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                  Frequent Applications
                </h4>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                  Frequently referenced workflows &amp; tools.
                </p>
              </div>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                {frequentApps.length} apps
              </span>
            </div>

            {/* Add App Form */}
            <form onSubmit={handleAddApp} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "var(--space-3)" }}>
              <input
                type="text"
                value={newApp}
                onChange={(e) => setNewApp(e.target.value)}
                placeholder="Add app (e.g. Spotify, VS Code, Slack)..."
                style={{
                  flex: 1,
                  padding: "5px 10px",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--color-text)",
                  fontSize: "11px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={saving || !newApp.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  backgroundColor: "var(--color-accent)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-bold)",
                  cursor: saving || !newApp.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !newApp.trim() ? 0.6 : 1,
                }}
              >
                <PlusIcon size={12} />
                Add
              </button>
            </form>

            {/* App Badges List */}
            {frequentApps.length === 0 ? (
              <div style={{ padding: "var(--space-6) 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)" }}>
                No frequent applications recorded.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "280px", overflowY: "auto" }}>
                {frequentApps.map((app) => (
                  <div
                    key={app}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{app}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveApp(app)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: "13px",
                        lineHeight: 1,
                        padding: 0,
                      }}
                      title={`Remove ${app}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ paddingTop: "var(--space-2)", borderTop: "1px solid var(--color-border-subtle)", fontSize: "10px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
            <InfoIcon size={12} />
            Used by Fluffy to optimize app-launching and window automation intents.
          </div>
        </div>
      </div>
    </div>
  );
};
