/**
 * Fluffy Desktop - Startup Manager View
 * 
 * Manages system startup and persistence entries across Registry and Startup folder.
 * Provides live search filter, status toggles, item removal, and add new entry modal.
 */

import React, { useState, useMemo } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { StartupRow } from "../components/StartupRow";
import { addStartupApp } from "../../../services/api/systems";
import type { StartupApp } from "../../../types/contracts";
import { 
  SearchIcon, 
  RefreshIcon, 
  PlusIcon, 
  LayersIcon, 
  CloseIcon,
  CheckIcon 
} from "../../../components/common/Icons";

export const StartupView: React.FC = () => {
  const telemetry = useTelemetryStore((s) => s.snapshot);
  const isOnline = useTelemetryStore((s) => s.connectionState === "CONNECTED");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const persistence: StartupApp[] = telemetry?.system?.persistence || telemetry?.persistence || [];

  const filteredEntries = useMemo(() => {
    return persistence.filter((entry) => {
      const matchesSearch =
        entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (entry.command && entry.command.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterStatus === "enabled") return entry.enabled;
      if (filterStatus === "disabled") return !entry.enabled;
      return true;
    });
  }, [persistence, searchQuery, filterStatus]);

  const enabledCount = persistence.filter((e) => e.enabled).length;
  const disabledCount = persistence.filter((e) => !e.enabled).length;

  const handleOpenAddModal = () => {
    setNewName("");
    setNewPath("");
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    if (isSubmitting) return;
    setIsAddModalOpen(false);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPath.trim()) {
      setAddError("Name and Executable Path are required.");
      return;
    }

    setIsSubmitting(true);
    setAddError(null);
    try {
      await addStartupApp(newName.trim(), newPath.trim());
      await telemetryCoordinator.refreshNow();
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add startup entry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-background)",
      }}
    >
      {/* View Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ color: "var(--color-accent)" }}>
            <LayersIcon size={18} />
          </span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
              }}
            >
              Startup & Persistence Manager
            </h2>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                marginTop: "2px",
              }}
            >
              {persistence.length} total entries &bull; {enabledCount} enabled &bull; {disabledCount} disabled
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {/* Status Filter Buttons */}
          <div
            style={{
              display: "flex",
              backgroundColor: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "2px",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {(["all", "enabled", "disabled"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: "4px 10px",
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-medium)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: filterStatus === status ? "var(--color-surface-elevated)" : "transparent",
                  color: filterStatus === status ? "var(--color-accent)" : "var(--color-text-muted)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Add Startup Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            disabled={!isOnline}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-background)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: isOnline ? "pointer" : "not-allowed",
              opacity: isOnline ? 1 : 0.6,
            }}
          >
            <PlusIcon size={13} />
            <span>Add Entry</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => telemetryCoordinator.refreshNow()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "5px 10px",
              fontSize: "11px",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
            title="Refresh Startup Entries"
          >
            <RefreshIcon size={12} />
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div
        style={{
          padding: "var(--space-2) var(--space-4)",
          backgroundColor: "var(--color-surface-subtle)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
        <input
          type="text"
          placeholder="Filter startup items by application name or command..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: "var(--color-text)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: "10px",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Startup Items Table */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "var(--color-background)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              backgroundColor: "var(--color-surface)",
              zIndex: 2,
              borderBottom: "1px solid var(--color-border)",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
            }}
          >
            <tr>
              <th style={{ padding: "8px 12px" }}>Application / Name</th>
              <th style={{ padding: "8px 12px" }}>Target Executable / Command</th>
              <th style={{ padding: "8px 12px", width: "120px" }}>Source</th>
              <th style={{ padding: "8px 12px", width: "110px", textAlign: "center" }}>Status</th>
              <th style={{ padding: "8px 12px", width: "90px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => (
              <StartupRow key={entry.name} entry={entry} />
            ))}
          </tbody>
        </table>

        {filteredEntries.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-8)",
              color: "var(--color-text-muted)",
              fontSize: "12px",
              textAlign: "center",
              gap: "var(--space-2)",
            }}
          >
            <LayersIcon size={32} style={{ opacity: 0.4 }} />
            <div>
              {searchQuery
                ? `No startup entries match query "${searchQuery}".`
                : "No startup or persistence items found on host."}
            </div>
          </div>
        )}
      </div>

      {/* Add Startup Entry Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseAddModal}
        >
          <div
            style={{
              width: "480px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-elevated)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)" }}>
                  <PlusIcon size={14} />
                </span>
                <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                  Add Startup Item
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseAddModal}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit} style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {addError && (
                <div
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    backgroundColor: "var(--color-danger-subtle)",
                    border: "1px solid var(--color-danger-border)",
                    color: "var(--color-danger)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "11px",
                  }}
                >
                  {addError}
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-text)",
                    marginBottom: "4px",
                  }}
                >
                  Application / Entry Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. MyBackgroundTool"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-text)",
                    marginBottom: "4px",
                  }}
                >
                  Target Executable Path or Command
                </label>
                <input
                  type="text"
                  placeholder="e.g. C:\Program Files\Tool\tool.exe --minimized"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: "10px",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.4,
                  marginTop: "var(--space-1)",
                }}
              >
                * Adds entry directly to Windows Registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "var(--space-2)",
                  marginTop: "var(--space-2)",
                  borderTop: "1px solid var(--color-border-subtle)",
                  paddingTop: "var(--space-3)",
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    backgroundColor: "var(--color-surface-subtle)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    padding: "6px 14px",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-background)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: isSubmitting ? "wait" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  <CheckIcon size={12} />
                  <span>{isSubmitting ? "Adding..." : "Add to Startup"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
