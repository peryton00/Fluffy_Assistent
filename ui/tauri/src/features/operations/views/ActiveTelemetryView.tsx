/**
 * Fluffy Desktop - Active Telemetry Deep Inspection View
 * 
 * Deep telemetry workspace rendering per-core CPU bars,
 * memory partition details, mounted filesystems, and network adapters.
 */

import React from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { OperationalHeader } from "../components/OperationalHeader";
import {
  CpuIcon,
  DatabaseIcon,
  HardDriveIcon,
  WifiIcon,
  BatteryIcon,
  PanelRightIcon,
} from "../../../components/common/Icons";

export const ActiveTelemetryView: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const selectedItem = useUiStore((s) => s.selectedItem);

  const cpu = snapshot?.system?.cpu || snapshot?.cpu;
  const ram = snapshot?.system?.ram || snapshot?.ram;
  const disks = snapshot?.system?.disks || snapshot?.disks || [];
  const network = snapshot?.system?.network;
  const battery = snapshot?.system?.battery || snapshot?.battery;

  const handleInspect = (type: "cpu" | "ram" | "disk" | "network" | "battery", id: string, title: string, data: Record<string, unknown>) => {
    uiStore.setSelectedItem({ type, id, title, data }, true);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
      <OperationalHeader
        title="Operations — Active Telemetry"
        subtitle="Granular subsystem telemetry, CPU core distribution, and hardware sensors"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "var(--space-4)" }}>
        {/* 1. CPU Telemetry Panel */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${selectedItem?.type === "cpu" ? "var(--color-accent)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><CpuIcon size={16} /></span>
              <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                Processor Cores & Frequency
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleInspect("cpu", "cpu-deep", "CPU Deep Inspection", { ...cpu })}
              style={{ fontSize: "10px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <PanelRightIcon size={11} />
              <span>Inspect</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                {cpu?.usage_percent !== undefined ? Math.round(cpu.usage_percent) : 0}%
              </span>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "var(--space-2)" }}>
                Total Load
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              {cpu?.frequency_mhz ? `${cpu.frequency_mhz} MHz` : ""} {cpu?.temperature ? `• ${cpu.temperature}°C` : ""}
            </div>
          </div>

          {/* Multi-core Bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
              Core Distribution ({cpu?.cores_usage?.length || 0} Cores)
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "6px" }}>
              {cpu?.cores_usage && cpu.cores_usage.length > 0 ? (
                cpu.cores_usage.map((usage, idx) => {
                  const val = Math.round(usage);
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "var(--radius-xs)",
                        padding: "4px 6px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>#{idx}</span>
                        <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-semibold)" }}>{val}%</span>
                      </div>
                      <div style={{ height: "3px", backgroundColor: "var(--color-surface)", borderRadius: "1px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${val}%`,
                            backgroundColor: val > 80 ? "var(--color-danger)" : "var(--color-accent)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Per-core telemetry unavailable</div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Memory (RAM) Telemetry Panel */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${selectedItem?.type === "ram" ? "var(--color-accent)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><DatabaseIcon size={16} /></span>
              <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                Memory Allocation & Buffers
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleInspect("ram", "ram-deep", "Memory Deep Inspection", { ...ram })}
              style={{ fontSize: "10px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <PanelRightIcon size={11} />
              <span>Inspect</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                {(() => {
                  if (ram?.usage_percent !== undefined) return Math.round(ram.usage_percent);
                  if (ram?.total_mb && ram.total_mb > 0 && ram?.used_mb !== undefined) {
                    return Math.round((ram.used_mb / ram.total_mb) * 100);
                  }
                  return 0;
                })()}%
              </span>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "var(--space-2)" }}>
                {ram?.used_mb ? (ram.used_mb / 1024).toFixed(2) : "0"} GB Used
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              Total: {ram?.total_mb ? (ram.total_mb / 1024).toFixed(1) : "0"} GB
            </div>
          </div>

          <div style={{ height: "6px", width: "100%", backgroundColor: "var(--color-surface-elevated)", borderRadius: "3px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(() => {
                  if (ram?.usage_percent !== undefined) return ram.usage_percent;
                  if (ram?.total_mb && ram.total_mb > 0 && ram?.used_mb !== undefined) {
                    return (ram.used_mb / ram.total_mb) * 100;
                  }
                  return 0;
                })()}%`,
                backgroundColor: (ram?.usage_percent || 0) > 85 ? "var(--color-danger)" : "var(--color-accent)",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Used MB</span>
              <div style={{ fontSize: "12px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>{ram?.used_mb || 0} MB</div>
            </div>
            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Free MB</span>
              <div style={{ fontSize: "12px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>{ram?.free_mb || 0} MB</div>
            </div>
            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Total MB</span>
              <div style={{ fontSize: "12px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>{ram?.total_mb || 0} MB</div>
            </div>
          </div>
        </div>

        {/* 3. Disks / Filesystem Mounts Panel */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${selectedItem?.type === "disk" ? "var(--color-accent)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><HardDriveIcon size={16} /></span>
              <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                Filesystem Mounts ({disks.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleInspect("disk", "disks-deep", "Storage Disks Inspection", { disks })}
              style={{ fontSize: "10px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <PanelRightIcon size={11} />
              <span>Inspect</span>
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {disks.length > 0 ? (
              disks.map((d, idx) => (
                <div
                  key={`${d.mount_point}-${idx}`}
                  style={{
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-xs)",
                    padding: "var(--space-2) var(--space-3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                    <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
                      {d.mount_point} {d.name ? `(${d.name})` : ""}
                    </span>
                    <span style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {d.used_percent !== undefined ? `${Math.round(d.used_percent)}% used` : ""}
                    </span>
                  </div>
                  <div style={{ height: "4px", backgroundColor: "var(--color-surface)", borderRadius: "2px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${d.used_percent || 0}%`,
                        backgroundColor: (d.used_percent || 0) > 90 ? "var(--color-danger)" : "var(--color-accent)",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-muted)" }}>
                    <span>Avail: {formatBytes(d.available_bytes)}</span>
                    <span>Total: {formatBytes(d.total_bytes)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Storage telemetry polled on deep scan</div>
            )}
          </div>
        </div>

        {/* 4. Network Adapters Panel */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${selectedItem?.type === "network" ? "var(--color-accent)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><WifiIcon size={16} /></span>
              <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                Network Interface
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleInspect("network", "net-deep", "Network Deep Inspection", { ...network })}
              style={{ fontSize: "10px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <PanelRightIcon size={11} />
              <span>Inspect</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                {network?.interface_name || ((network as unknown as Record<string, unknown>)?.status ? String((network as unknown as Record<string, unknown>).status).toUpperCase() : "Active")}
              </span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--color-success)", fontWeight: "var(--font-weight-bold)" }}>
              ● LINK UP
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Bytes Transferred</span>
              <div style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                RX: {formatBytes(network?.bytes_recv !== undefined ? network.bytes_recv : ((network as unknown as Record<string, unknown>)?.received_kb ? Number((network as unknown as Record<string, unknown>).received_kb) * 1024 : 0))}
              </div>
              <div style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                TX: {formatBytes(network?.bytes_sent !== undefined ? network.bytes_sent : ((network as unknown as Record<string, unknown>)?.transmitted_kb ? Number((network as unknown as Record<string, unknown>).transmitted_kb) * 1024 : 0))}
              </div>
            </div>

            <div style={{ backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Packets / Speed</span>
              <div style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                {network?.speed_mbps !== undefined ? `${network.speed_mbps} Mbps` : `RX: ${(network?.packets_recv || 0).toLocaleString()}`}
              </div>
              <div style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                {network?.speed_mbps !== undefined ? `Status: ${String((network as unknown as Record<string, unknown>)?.status || "online")}` : `TX: ${(network?.packets_sent || 0).toLocaleString()}`}
              </div>
            </div>
          </div>
        </div>


        {/* 5. Battery / Power Telemetry Panel */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${selectedItem?.type === "battery" ? "var(--color-accent)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--color-accent)", display: "flex" }}><BatteryIcon size={16} /></span>
              <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                Battery & Power State
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleInspect("battery", "battery-deep", "Battery Deep Inspection", { ...battery })}
              style={{ fontSize: "10px", color: "var(--color-accent)", backgroundColor: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <PanelRightIcon size={11} />
              <span>Inspect</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)" }}>
                {battery?.percent !== undefined ? `${Math.round(battery.percent)}%` : "N/A"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "var(--space-2)" }}>
                {battery?.is_charging ? "Charging" : (battery ? "Discharging" : "AC Line Powered")}
              </span>
            </div>
            <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontWeight: "var(--font-weight-bold)" }}>
              {battery ? (battery.is_charging ? "ON CHARGER" : "ON BATTERY") : "DESKTOP / DIRECT POWER"}
            </span>
          </div>

          {battery?.percent !== undefined && (
            <div style={{ height: "4px", backgroundColor: "var(--color-surface-elevated)", borderRadius: "2px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${battery.percent}%`,
                  backgroundColor: battery.percent < 20 ? "var(--color-danger)" : "var(--color-accent)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

