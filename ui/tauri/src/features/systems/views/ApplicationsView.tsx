/**
 * Fluffy Desktop - Applications Manager View
 * 
 * Manages system-installed applications, discovery cache,
 * deep registry scanning, executable launching, and uninstallation.
 */

import React, { useEffect, useState } from "react";
import { useAppsStore, appsStore } from "../../../stores/appsStore";
import { SystemsHeader } from "../components/SystemsHeader";
import { ApplicationCard } from "../components/ApplicationCard";
import { SearchIcon, RefreshCwIcon, GridIcon } from "../../../components/common/Icons";

export const ApplicationsView: React.FC = () => {
  const apps = useAppsStore((s) => s.apps);
  const loading = useAppsStore((s) => s.loading);
  const isRefreshing = useAppsStore((s) => s.isRefreshing);
  const error = useAppsStore((s) => s.error);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    appsStore.loadApps(false);
  }, []);

  const filtered = apps.filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      (app.publisher && app.publisher.toLowerCase().includes(q)) ||
      (app.exe_path && app.exe_path.toLowerCase().includes(q))
    );
  });

  const handleRefresh = async () => {
    await appsStore.refreshDeep();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", width: "100%", height: "100%" }}>
      <SystemsHeader
        title="Applications Manager"
        subtitle="Installed desktop software inventory, start menu shortcuts, and package execution"
        onRefresh={handleRefresh}
      />

      {/* Controls Bar: Search & Deep Rescan */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 240px", maxWidth: "360px" }}>
          <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search installed applications..."
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              fontSize: "12px",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: isRefreshing ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCwIcon size={12} style={{ transform: isRefreshing ? "rotate(180deg)" : "none", transition: "transform 0.3s" }} />
            <span>{isRefreshing ? "Scanning Registry..." : "Deep Re-scan"}</span>
          </button>

          <span
            style={{
              fontSize: "10px",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text-muted)",
              backgroundColor: "var(--color-surface-elevated)",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {filtered.length} Discovered
          </span>
        </div>
      </div>

      {/* Applications Grid Canvas */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingRight: "2px",
        }}
      >
        {loading && apps.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-8)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-md)",
              gap: "var(--space-2)",
              color: "var(--color-text-muted)",
            }}
          >
            <GridIcon size={24} />
            <p style={{ fontSize: "var(--font-size-xs)", margin: 0 }}>Scanning installed desktop applications...</p>
          </div>
        ) : error && apps.length === 0 ? (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-danger)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Failed to load applications: {error.message}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "var(--space-8)",
              textAlign: "center",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {searchQuery ? `No applications matching "${searchQuery}"` : "No desktop applications discovered"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {filtered.map((app) => (
              <ApplicationCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
