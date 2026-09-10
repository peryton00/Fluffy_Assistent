/**
 * Fluffy Desktop - Systems Overview View
 * 
 * Command center overview for the Systems domain.
 * Aggregates process metrics, installed application count, startup items,
 * LAN nodes, and hardware health into a dense, clean engineering surface.
 */

import React from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useAppsStore } from "../../../stores/appsStore";
import { useNetworkStore } from "../../../stores/networkStore";
import { uiStore } from "../../../stores/uiStore";
import { SystemsHeader } from "../components/SystemsHeader";
import {
  CpuIcon,
  DatabaseIcon,
  HardDriveIcon,
  WifiIcon,
  LayersIcon,
  GridIcon,
  ServerIcon,
  ChevronRightIcon,
} from "../../../components/common/Icons";

export const SystemsOverview: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const apps = useAppsStore((s) => s.apps);
  const machines = useNetworkStore((s) => s.machines);
  const role = useNetworkStore((s) => s.role);

  const cpu = snapshot?.system?.cpu || snapshot?.cpu;
  const ram = snapshot?.system?.ram || snapshot?.ram;
  const disks = snapshot?.system?.disks || snapshot?.disks;
  const primaryDisk = disks && disks.length > 0 ? disks[0] : undefined;
  const network = snapshot?.system?.network;
  const processes = snapshot?.system?.processes || snapshot?.processes;
  const startupEntries = snapshot?.persistence || [];

  const topProcesses = processes?.top_cpu ? processes.top_cpu.slice(0, 5) : [];
  const processCount = processes?.total_count || (processes?.top_cpu ? processes.top_cpu.length : 0);

  const handleNavigate = (view: string) => {
    uiStore.setActiveSidebarView(view);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
      <SystemsHeader
        title="Systems Command Center"
        subtitle="Host process hierarchy, application inventory, startup persistence, and LAN devices"
      />

      {/* Primary Metric Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
        {/* Processes summary */}
        <div
          onClick={() => handleNavigate("processes")}
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3) var(--space-4)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              Processes
            </span>
            <span style={{ color: "var(--color-accent)" }}><CpuIcon size={16} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
              {processCount}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              CPU: {cpu?.usage_percent !== undefined ? Math.round(cpu.usage_percent) : 0}%
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "2px" }}>
            <span>Explore process tree</span>
            <ChevronRightIcon size={10} />
          </div>
        </div>

        {/* Applications summary */}
        <div
          onClick={() => handleNavigate("apps")}
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3) var(--space-4)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              Applications
            </span>
            <span style={{ color: "var(--color-accent)" }}><GridIcon size={16} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
              {apps.length > 0 ? apps.length : "Discovered"}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              Installed software
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "2px" }}>
            <span>Manage applications</span>
            <ChevronRightIcon size={10} />
          </div>
        </div>

        {/* Startup persistence */}
        <div
          onClick={() => handleNavigate("startup")}
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3) var(--space-4)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              Startup Entries
            </span>
            <span style={{ color: "var(--color-accent)" }}><LayersIcon size={16} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
              {startupEntries.length}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              {startupEntries.filter((e) => e.enabled).length} Enabled
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "2px" }}>
            <span>Configure startup</span>
            <ChevronRightIcon size={10} />
          </div>
        </div>

        {/* Network LAN */}
        <div
          onClick={() => handleNavigate("network")}
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3) var(--space-4)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              LAN Nodes
            </span>
            <span style={{ color: "var(--color-accent)" }}><ServerIcon size={16} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
              {machines.length}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "capitalize" }}>
              Role: {role}
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-accent)", display: "flex", alignItems: "center", gap: "2px" }}>
            <span>Manage LAN devices</span>
            <ChevronRightIcon size={10} />
          </div>
        </div>
      </div>

      {/* Dual Section: Top Active Processes & Hardware Snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "var(--space-4)" }}>
        {/* Top Processes Table */}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
              Top Load Processes
            </h2>
            <button
              type="button"
              onClick={() => handleNavigate("processes")}
              style={{ fontSize: "11px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px" }}
            >
              <span>View All</span>
              <ChevronRightIcon size={11} />
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", color: "var(--color-text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>PID</th>
                  <th style={{ padding: "4px 8px" }}>NAME</th>
                  <th style={{ padding: "4px 8px" }}>CPU%</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>RAM</th>
                </tr>
              </thead>
              <tbody>
                {topProcesses.length > 0 ? (
                  topProcesses.map((p) => (
                    <tr key={p.pid} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--color-text-muted)" }}>{p.pid}</td>
                      <td style={{ padding: "6px 8px", color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>{p.name}</td>
                      <td style={{ padding: "6px 8px", color: "var(--color-accent)" }}>{(p.cpu_percent || 0).toFixed(1)}%</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{Math.round(p.ram_mb || 0)} MB</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--color-text-muted)" }}>
                      No active process telemetry recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hardware Status Snapshot */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
              Hardware & Power Snapshot
            </h2>
            <button
              type="button"
              onClick={() => handleNavigate("hardware")}
              style={{ fontSize: "11px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px" }}
            >
              <span>Hardware View</span>
              <ChevronRightIcon size={11} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-3)", borderRadius: "var(--radius-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
                <DatabaseIcon size={12} />
                <span>Memory Available</span>
              </div>
              <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {ram?.free_mb ? `${(ram.free_mb / 1024).toFixed(1)} GB Free` : "N/A"}
              </div>
            </div>

            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-3)", borderRadius: "var(--radius-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
                <HardDriveIcon size={12} />
                <span>Disk Available</span>
              </div>
              <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {primaryDisk ? `${(primaryDisk.available_bytes / 1024 / 1024 / 1024).toFixed(0)} GB Free` : "Healthy"}
              </div>
            </div>

            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-3)", borderRadius: "var(--radius-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
                <WifiIcon size={12} />
                <span>Active Interface</span>
              </div>
              <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {network?.interface_name || "Connected"}
              </div>
            </div>

            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-3)", borderRadius: "var(--radius-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
                <CpuIcon size={12} />
                <span>Core Temperature</span>
              </div>
              <div style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {cpu?.temperature ? `${cpu.temperature}°C` : "Nominal"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
