/**
 * Fluffy Desktop - Hardware Engineering Telemetry View
 * 
 * Detailed system hardware monitoring:
 * - CPU physical/logical specs, per-core metrics, frequency
 * - RAM buffers, active/free memory breakdown
 * - Disk filesystem mount points and usage
 * - Network interfaces, throughput counters, speed
 * - Power management / Battery health
 */

import React from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { uiStore } from "../../../stores/uiStore";
import {
  CpuIcon,
  MemoryIcon,
  HardDriveIcon,
  ActivityIcon,
  RefreshIcon,
  WifiIcon
} from "../../../components/common/Icons";

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const HardwareView: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);

  const cpu = snapshot?.system?.cpu || snapshot?.cpu;
  const ram = snapshot?.system?.ram || snapshot?.ram;
  const disks = snapshot?.system?.disks || snapshot?.disks || [];
  const network = snapshot?.system?.network;
  const battery = snapshot?.system?.battery || snapshot?.battery;

  const handleSelectHardware = (type: string, title: string, data: Record<string, unknown>) => {
    uiStore.setSelectedItem({
      type: "hardware",
      id: `${type}-${title}`,
      title: `Hardware: ${title}`,
      data,
    }, true);
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
      {/* Hardware Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ color: "var(--color-accent)" }}>
            <CpuIcon size={18} />
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
              Hardware & Device Telemetry
            </h2>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                marginTop: "2px",
              }}
            >
              Real-time hardware sensors, mount points, and interface telemetry
            </div>
          </div>
        </div>

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
          title="Refresh Hardware Telemetry"
        >
          <RefreshIcon size={12} />
        </button>
      </div>

      {/* Main Telemetry Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Top Grid: CPU & Memory Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          {/* CPU Telemetry Card */}
          <div
            onClick={() =>
              handleSelectHardware("cpu", "Processor", {
                usage_percent: `${cpu?.usage_percent?.toFixed(1) || 0}%`,
                logical_cores: cpu?.cores_usage?.length || "Unknown",
                frequency_mhz: cpu?.frequency_mhz ? `${cpu.frequency_mhz} MHz` : "Dynamic",
                temperature: cpu?.temperature ? `${cpu.temperature} °C` : "N/A",
              })
            }
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <CpuIcon size={16} style={{ color: "var(--color-accent)" }} />
                <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                  Processor (CPU)
                </span>
              </div>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "var(--font-weight-bold)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-accent)",
                }}
              >
                {cpu?.usage_percent !== undefined ? `${cpu.usage_percent.toFixed(1)}%` : "0.0%"}
              </span>
            </div>

            {/* Overall Bar */}
            <div
              style={{
                width: "100%",
                height: "6px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
                marginBottom: "var(--space-3)",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, cpu?.usage_percent || 0))}%`,
                  height: "100%",
                  backgroundColor:
                    (cpu?.usage_percent || 0) > 85
                      ? "var(--color-danger)"
                      : (cpu?.usage_percent || 0) > 60
                      ? "var(--color-warning)"
                      : "var(--color-accent)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* CPU Specs Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-2)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              <div>Logical Cores: <strong style={{ color: "var(--color-text)" }}>{cpu?.cores_usage?.length ?? "N/A"}</strong></div>
              <div>Frequency: <strong style={{ color: "var(--color-text)" }}>{cpu?.frequency_mhz ? `${cpu.frequency_mhz} MHz` : "N/A"}</strong></div>
            </div>
          </div>

          {/* Memory (RAM) Card */}
          <div
            onClick={() =>
              handleSelectHardware("ram", "System Memory", {
                total_mb: `${ram?.total_mb || 0} MB`,
                used_mb: `${ram?.used_mb || 0} MB`,
                free_mb: `${ram?.free_mb || 0} MB`,
                usage_percent: `${ram?.usage_percent?.toFixed(1) || 0}%`,
              })
            }
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <MemoryIcon size={16} style={{ color: "var(--color-accent)" }} />
                <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                  Physical RAM
                </span>
              </div>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "var(--font-weight-bold)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-accent)",
                }}
              >
                {ram?.usage_percent !== undefined ? `${ram.usage_percent.toFixed(1)}%` : "0.0%"}
              </span>
            </div>

            {/* RAM Bar */}
            <div
              style={{
                width: "100%",
                height: "6px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
                marginBottom: "var(--space-3)",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, ram?.usage_percent || 0))}%`,
                  height: "100%",
                  backgroundColor:
                    (ram?.usage_percent || 0) > 85
                      ? "var(--color-danger)"
                      : (ram?.usage_percent || 0) > 70
                      ? "var(--color-warning)"
                      : "var(--color-accent)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* RAM Breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--space-2)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
              }}
            >
              <div>Used: <strong style={{ color: "var(--color-text)" }}>{ram?.used_mb ? `${Math.round(ram.used_mb / 1024)} GB` : "0 GB"}</strong></div>
              <div>Free: <strong style={{ color: "var(--color-text)" }}>{ram?.free_mb ? `${Math.round(ram.free_mb / 1024)} GB` : "0 GB"}</strong></div>
              <div>Total: <strong style={{ color: "var(--color-text)" }}>{ram?.total_mb ? `${Math.round(ram.total_mb / 1024)} GB` : "0 GB"}</strong></div>
            </div>
          </div>
        </div>

        {/* Storage Mount Points */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
            <HardDriveIcon size={16} style={{ color: "var(--color-accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
              Storage Disks & Filesystem Mounts ({disks.length})
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {disks.map((disk) => {
              const usedPct = disk.used_percent ?? 0;
              return (
                <div
                  key={disk.mount_point || disk.name}
                  onClick={() =>
                    handleSelectHardware("disk", disk.mount_point || disk.name, {
                      name: disk.name,
                      mount_point: disk.mount_point,
                      total: formatBytes(disk.total_bytes),
                      available: formatBytes(disk.available_bytes),
                      usage: `${usedPct.toFixed(1)}%`,
                    })
                  }
                  style={{
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-3)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                    <span style={{ fontSize: "12px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                      {disk.mount_point || disk.name}
                    </span>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)" }}>
                      {usedPct.toFixed(1)}%
                    </span>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      height: "5px",
                      backgroundColor: "var(--color-surface-elevated)",
                      borderRadius: "var(--radius-full)",
                      overflow: "hidden",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, usedPct))}%`,
                        height: "100%",
                        backgroundColor: usedPct > 90 ? "var(--color-danger)" : usedPct > 75 ? "var(--color-warning)" : "var(--color-accent)",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <span>Free: {formatBytes(disk.available_bytes)}</span>
                    <span>Total: {formatBytes(disk.total_bytes)}</span>
                  </div>
                </div>
              );
            })}

            {disks.length === 0 && (
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                No disk mounts detected.
              </div>
            )}
          </div>
        </div>

        {/* Network Adapter */}
        {network && (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <WifiIcon size={16} style={{ color: "var(--color-accent)" }} />
              <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                Network Interface ({network.interface_name})
              </span>
            </div>

            <div
              onClick={() =>
                handleSelectHardware("network", network.interface_name, {
                  interface: network.interface_name,
                  bytes_sent: formatBytes(network.bytes_sent),
                  bytes_recv: formatBytes(network.bytes_recv),
                  packets_sent: network.packets_sent,
                  packets_recv: network.packets_recv,
                  speed_mbps: network.speed_mbps ? `${network.speed_mbps} Mbps` : "N/A",
                  ping_ms: network.ping_ms ? `${network.ping_ms} ms` : "N/A",
                })
              }
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <span style={{ fontSize: "12px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                  {network.interface_name}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: "var(--color-success-subtle)",
                    color: "var(--color-success)",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                  }}
                >
                  Active Link
                </span>
              </div>

              <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TX Bytes: <strong style={{ color: "var(--color-text)" }}>{formatBytes(network.bytes_sent)}</strong> ({network.packets_sent} pkts)</span>
                  <span>RX Bytes: <strong style={{ color: "var(--color-text)" }}>{formatBytes(network.bytes_recv)}</strong> ({network.packets_recv} pkts)</span>
                </div>
                {network.speed_mbps && (
                  <div style={{ marginTop: "4px" }}>Bandwidth: <strong style={{ color: "var(--color-accent)" }}>{network.speed_mbps} Mbps</strong></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Battery & Power (if available) */}
        {battery && (
          <div
            onClick={() =>
              handleSelectHardware("battery", "Power Source", {
                percent: `${battery.percent}%`,
                charging: battery.is_charging ? "Yes" : "No",
                time_remaining_minutes: battery.time_remaining_minutes || "Unknown",
              })
            }
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <ActivityIcon size={16} style={{ color: "var(--color-accent)" }} />
              <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                Battery & Power Supply
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
              <div style={{ fontSize: "22px", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
                {battery.percent}%
              </div>
              <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                <div>State: <strong style={{ color: "var(--color-text)" }}>{battery.is_charging ? "Charging" : "In Use"}</strong></div>
                {battery.time_remaining_minutes && (
                  <div>Time Remaining: <strong style={{ color: "var(--color-text)" }}>{battery.time_remaining_minutes} min</strong></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
