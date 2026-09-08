/**
 * Fluffy Desktop - Preferences View
 * 
 * Key-value preference store for AI behavior, system settings,
 * and user-defined operational overrides.
 */

import React, { useState, useEffect } from "react";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useUIStore } from "../../../stores/uiStore";
import { PreferenceRow } from "../components/PreferenceRow";
import {
  BookOpenIcon,
  SearchIcon,
  PlusIcon,
  RefreshIcon,
  InfoIcon,
} from "../../../components/common/Icons";

export const PreferencesView: React.FC = () => {
  const memory = useMemoryStore();
  const { setInspectorItem } = useUIStore();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [newKey, setNewKey] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  useEffect(() => {
    memory.loadPreferences();
  }, []);

  const prefEntries = Object.entries(memory.preferences);

  const filteredEntries = prefEntries.filter(([k, v]) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchKey = k.toLowerCase().includes(q);
    const matchVal = String(v).toLowerCase().includes(q);
    return matchKey || matchVal;
  });

  const handleAddPreference = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = newKey.trim();
    if (!k) return;

    setIsAdding(true);
    try {
      let parsedVal: unknown = newValue.trim();
      try {
        parsedVal = JSON.parse(newValue.trim());
      } catch {
        parsedVal = newValue.trim();
      }
      await memory.updatePreference(k, parsedVal);
      setNewKey("");
      setNewValue("");
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async (key: string, value: unknown) => {
    await memory.updatePreference(key, value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Add Preference Card */}
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
          <div>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><BookOpenIcon size={16} /></span>
              Memory Preferences Store
            </h3>
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Configurable runtime flags and behavioral overrides accessed by Fluffy agents.
            </p>
          </div>

          <button
            type="button"
            disabled={memory.loading}
            onClick={() => memory.loadPreferences(true)}
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

        {/* Form */}
        <form onSubmit={handleAddPreference} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <div style={{ flex: "1 1 180px" }}>
            <input
              type="text"
              placeholder="Key (e.g. default_browser)..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                outline: "none",
              }}
            />
          </div>
          <div style={{ flex: "2 1 240px" }}>
            <input
              type="text"
              placeholder='Value (e.g. "chrome", true, 42)...'
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isAdding || !newKey.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 14px",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-xs)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-bold)",
              cursor: isAdding || !newKey.trim() ? "not-allowed" : "pointer",
              opacity: isAdding || !newKey.trim() ? 0.6 : 1,
            }}
          >
            <PlusIcon size={12} />
            {isAdding ? "Saving..." : "Set Key"}
          </button>
        </form>
      </div>

      {/* List Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              placeholder="Search preferences by key or value..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "10px",
                paddingTop: "5px",
                paddingBottom: "5px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                outline: "none",
              }}
            />
          </div>
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {filteredEntries.length} of {prefEntries.length} preferences
          </span>
        </div>

        {/* Rows */}
        {filteredEntries.length === 0 ? (
          <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-8) var(--space-4)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
            <InfoIcon size={20} />
            <span>No preferences match the current filter.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {filteredEntries.map(([key, val]) => (
              <PreferenceRow
                key={key}
                prefKey={key}
                value={val}
                onUpdate={handleUpdate}
                onSelect={(k, v) =>
                  setInspectorItem({
                    id: `pref-${k}`,
                    type: "memoryPreference",
                    title: `Preference: ${k}`,
                    data: { key: k, value: v },
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
