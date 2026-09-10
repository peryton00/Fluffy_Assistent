import React, { useEffect, useState } from "react";
import { useAppsStore, appsStore } from "../../../stores/appsStore";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { SystemsHeader } from "../components/SystemsHeader";
import { ApplicationCard } from "../components/ApplicationCard";
import { RunningSoftwareCard } from "../components/RunningSoftwareCard";
import { SearchIcon, RefreshCwIcon, GridIcon, ActivityIcon } from "../../../components/common/Icons";
import type { ProcessTelemetry } from "../../../types/contracts";

export const ApplicationsView: React.FC = () => {
  const apps = useAppsStore((s) => s.apps);
  const loading = useAppsStore((s) => s.loading);
  const isRefreshing = useAppsStore((s) => s.isRefreshing);
  const error = useAppsStore((s) => s.error);
  const snapshot = useTelemetryStore((s) => s.snapshot);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "running" | "installed">("all");

  useEffect(() => {
    appsStore.loadApps(false);
  }, []);

  const filteredApps = apps.filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      (app.publisher && app.publisher.toLowerCase().includes(q)) ||
      (app.exe_path && app.exe_path.toLowerCase().includes(q))
    );
  });

  const topRam: ProcessTelemetry[] = snapshot?.system?.processes?.top_ram || snapshot?.processes?.top_ram || [];
  const topCpu: ProcessTelemetry[] = snapshot?.system?.processes?.top_cpu || snapshot?.processes?.top_cpu || [];

  // Merge and deduplicate running processes from snapshot
  const runningProcessMap = new Map<number, ProcessTelemetry>();
  [...topRam, ...topCpu].forEach((proc) => {
    if (proc && typeof proc.pid === "number") {
      runningProcessMap.set(proc.pid, proc);
    }
  });
  const rawRunning = Array.from(runningProcessMap.values());

  // Group processes by application / executable name
  const runningGroups = React.useMemo(() => {
    const groups = new Map<string, ProcessTelemetry[]>();

    for (const proc of rawRunning) {
      const key = proc.name.toLowerCase();
      const list = groups.get(key);
      if (list) {
        list.push(proc);
      } else {
        groups.set(key, [proc]);
      }
    }

    const result = Array.from(groups.values()).map((procs) => {
      // Sort by PID ascending so the parent / first created process is root
      procs.sort((a, b) => a.pid - b.pid);
      const root = procs[0];
      const totalCpu = procs.reduce((acc, p) => acc + (p.cpu_percent || 0), 0);
      const totalRam = procs.reduce((acc, p) => acc + (p.ram_mb || 0), 0);

      return {
        id: `running-app-${root.name}-${root.pid}`,
        name: root.name,
        rootPid: root.pid,
        totalCpu,
        totalRam,
        processCount: procs.length,
        children: procs,
        rootProcess: root,
      };
    });

    return result.sort((a, b) => b.totalRam - a.totalRam);
  }, [rawRunning]);

  const filteredRunningGroups = runningGroups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      String(g.rootPid).includes(q) ||
      g.children.some((c) => String(c.pid).includes(q) || c.name.toLowerCase().includes(q))
    );
  });

  const handleRefresh = async () => {
    await appsStore.refreshDeep();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", width: "100%", height: "100%" }}>
      <SystemsHeader
        title="Applications Manager"
        subtitle="Installed desktop software inventory, active running processes, and execution control"
        onRefresh={handleRefresh}
      />

      {/* Controls Bar: Search, Tabs & Deep Rescan */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 240px", maxWidth: "340px" }}>
          <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search software or processes..."
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

        {/* View Segmented Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "var(--color-surface-subtle)", padding: "2px", borderRadius: "var(--radius-xs)" }}>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: activeTab === "all" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
              backgroundColor: activeTab === "all" ? "var(--color-surface-elevated)" : "transparent",
              color: activeTab === "all" ? "var(--color-text)" : "var(--color-text-muted)",
              border: activeTab === "all" ? "1px solid var(--color-border)" : "1px solid transparent",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            All ({filteredRunningGroups.length + filteredApps.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("running")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: activeTab === "running" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
              backgroundColor: activeTab === "running" ? "var(--color-surface-elevated)" : "transparent",
              color: activeTab === "running" ? "var(--color-success)" : "var(--color-text-muted)",
              border: activeTab === "running" ? "1px solid var(--color-border)" : "1px solid transparent",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-success)" }} />
            <span>Running ({filteredRunningGroups.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("installed")}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: activeTab === "installed" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
              backgroundColor: activeTab === "installed" ? "var(--color-surface-elevated)" : "transparent",
              color: activeTab === "installed" ? "var(--color-text)" : "var(--color-text-muted)",
              border: activeTab === "installed" ? "1px solid var(--color-border)" : "1px solid transparent",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            Installed ({filteredApps.length})
          </button>
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
        </div>
      </div>

      {/* Main Canvas */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingRight: "2px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* 1. Active Running Softwares Section */}
        {(activeTab === "all" || activeTab === "running") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-success)" }}>
                <ActivityIcon size={14} />
                <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                  Active Running Software ({filteredRunningGroups.length})
                </h2>
              </div>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                Live process telemetry & task termination
              </span>
            </div>

            {filteredRunningGroups.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-4)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-muted)",
                  fontSize: "11px",
                  textAlign: "center",
                }}
              >
                No active running software matching filter.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {filteredRunningGroups.map((group) => (
                  <RunningSoftwareCard key={group.id} group={group} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Installed Applications Section */}
        {(activeTab === "all" || activeTab === "installed") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-accent)" }}>
                <GridIcon size={14} />
                <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                  Installed Software & Packages ({filteredApps.length})
                </h2>
              </div>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                Start Menu & Registry Inventory
              </span>
            </div>

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
            ) : filteredApps.length === 0 ? (
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
                {filteredApps.map((app) => (
                  <ApplicationCard key={app.id} app={app} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

