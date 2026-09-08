/**
 * Fluffy Desktop - Trusted Processes View
 *
 * Whitelist manager for processes authorized to execute without triggering
 * autonomous Guardian intervention or kill actions.
 */

import React, { useState, useEffect } from "react";
import { useGuardianStore } from "../../../stores/guardianStore";
import { useUIStore } from "../../../stores/uiStore";
import { TrustedProcessRow } from "../components/TrustedProcessRow";
import {
  ShieldCheckIcon,
  SearchIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";

export const TrustedProcessesView: React.FC = () => {
  const guardian = useGuardianStore();
  const { setInspectorItem } = useUIStore();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [newProcessName, setNewProcessName] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  useEffect(() => {
    guardian.loadTrustedProcesses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProcesses = guardian.trustedProcesses.filter((proc) =>
    proc.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProcessName.trim();
    if (!name) return;
    setIsAdding(true);
    try {
      await guardian.addTrusted(name);
      setNewProcessName("");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (processName: string) => {
    await guardian.removeTrusted(processName);
  };

  const handleClearRecognition = async () => {
    setIsClearing(true);
    try {
      await guardian.resetRecognition();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  const card: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Controls & Add Section */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            paddingBottom: "var(--space-3)",
            borderBottom: "1px solid var(--color-border)",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                margin: "0 0 4px",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <span style={{ color: "var(--color-success)", display: "flex" }}><ShieldCheckIcon size={16} /></span>
              Trusted Processes Whitelist
            </h3>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0 }}>
              Whitelisted binaries and names are permitted to run without autonomous kill heuristics.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => guardian.loadTrustedProcesses(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              <RefreshIcon size={12} />
              Reload
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-danger)",
                cursor: "pointer",
              }}
            >
              <TrashIcon size={12} />
              Reset Baselines
            </button>
          </div>
        </div>

        {/* Add Process Form */}
        <form
          onSubmit={handleAdd}
          style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}
        >
          <input
            type="text"
            placeholder="Enter process executable name (e.g., code.exe, python.exe, node.exe)..."
            value={newProcessName}
            onChange={(e) => setNewProcessName(e.target.value)}
            style={{
              flex: "1 1 200px",
              padding: "7px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={isAdding || !newProcessName.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              padding: "7px 14px",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-accent)",
              border: "1px solid var(--color-accent)",
              borderRadius: "var(--radius-xs)",
              color: "#fff",
              cursor: isAdding || !newProcessName.trim() ? "not-allowed" : "pointer",
              opacity: isAdding || !newProcessName.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <PlusIcon size={14} />
            {isAdding ? "Adding..." : "Add to Whitelist"}
          </button>
        </form>
      </div>

      {/* Confirmation for Reset Baselines */}
      {showClearConfirm && (
        <div
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <span style={{ color: "var(--color-danger)", display: "flex", flexShrink: 0, marginTop: "2px" }}>
              <AlertTriangleIcon size={16} />
            </span>
            <div>
              <h4 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-danger)", margin: "0 0 4px" }}>
                Clear Guardian Recognition Baselines?
              </h4>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
                This triggers POST <code>/clear_guardian</code> to reset behavioral anomaly learning baselines.
                Existing static whitelists will remain in memory.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              style={{
                padding: "4px 12px",
                fontSize: "var(--font-size-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearRecognition}
              style={{
                padding: "4px 12px",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                backgroundColor: "var(--color-danger)",
                border: "1px solid var(--color-danger)",
                borderRadius: "var(--radius-xs)",
                color: "#fff",
                cursor: isClearing ? "wait" : "pointer",
                opacity: isClearing ? 0.6 : 1,
              }}
            >
              {isClearing ? "Resetting..." : "Confirm Reset"}
            </button>
          </div>
        </div>
      )}

      {/* Filter and List Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div
          style={{
            ...card,
            flexDirection: "row",
            alignItems: "center",
            gap: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 200px" }}>
            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              placeholder="Search whitelisted processes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "12px",
                paddingTop: "6px",
                paddingBottom: "6px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", flexShrink: 0 }}>
            {filteredProcesses.length} of {guardian.trustedProcesses.length} trusted
          </span>
        </div>

        {guardian.loading && guardian.trustedProcesses.length === 0 ? (
          <div
            style={{
              ...card,
              padding: "var(--space-6)",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Loading whitelist from memory...
          </div>
        ) : filteredProcesses.length === 0 ? (
          <div
            style={{
              ...card,
              padding: "var(--space-6)",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <ShieldCheckIcon size={28} />
            <span>No trusted processes match the query.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {filteredProcesses.map((processName) => (
              <TrustedProcessRow
                key={processName}
                processName={processName}
                onRemove={handleRemove}
                onSelect={(name) =>
                  setInspectorItem({
                    id: name,
                    type: "trustedProcess",
                    title: `Trusted: ${name}`,
                    data: { processName: name, trusted: true },
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
