/**
 * Fluffy Desktop - Operations Overview View
 * 
 * Primary operations command center interface.
 * Dense, industrial layout adhering to Fluffy design tokens.
 */

import React, { useEffect } from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";

import { logsCoordinator } from "../../../stores/logsStore";
import { OperationalHeader } from "../components/OperationalHeader";
import { TelemetryMetricCard } from "../components/TelemetryMetricCard";
import { SubsystemsStatusCard } from "../components/SubsystemsStatusCard";
import { GuardianSummaryCard } from "../components/GuardianSummaryCard";
import { QuickActionsCard } from "../components/QuickActionsCard";
import { RecentActivityFeed } from "../components/RecentActivityFeed";
import { CpuIcon, DatabaseIcon, HardDriveIcon, WifiIcon, BatteryIcon } from "../../../components/common/Icons";

export const OperationsOverview: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const connectionState = useTelemetryStore((s) => s.connectionState);

  // Ensure logs coordinator is active when operations overview is mounted
  useEffect(() => {
    logsCoordinator.start();
  }, []);

  // System metrics derivation
  const cpu = snapshot?.system?.cpu || snapshot?.cpu;
  const ram = snapshot?.system?.ram || snapshot?.ram;
  const disks = snapshot?.system?.disks || snapshot?.disks;
  const primaryDisk = disks && disks.length > 0 ? disks[0] : undefined;
  const network = snapshot?.system?.network;
  const battery = snapshot?.system?.battery || snapshot?.battery;

  // CPU metric values
  const cpuPercent = cpu?.usage_percent !== undefined ? Math.round(cpu.usage_percent) : 0;
  const cpuPrimary = `${cpuPercent}%`;
  const cpuSecondary = cpu?.cores_usage ? `${cpu.cores_usage.length} Cores` : undefined;

  // RAM metric values
  const ramPercent = ram?.usage_percent !== undefined ? Math.round(ram.usage_percent) : 0;
  const ramUsedGb = ram?.used_mb ? (ram.used_mb / 1024).toFixed(1) : "0";
  const ramTotalGb = ram?.total_mb ? (ram.total_mb / 1024).toFixed(1) : "0";
  const ramPrimary = `${ramUsedGb} / ${ramTotalGb} GB`;
  const ramSecondary = `${ramPercent}% Used`;

  // Disk metric values
  const diskPercent = primaryDisk?.used_percent !== undefined ? Math.round(primaryDisk.used_percent) : undefined;
  const diskPrimary = diskPercent !== undefined ? `${diskPercent}%` : "Ready";
  const diskSecondary = primaryDisk?.mount_point ? `Mount ${primaryDisk.mount_point}` : undefined;

  // Network metric values
  const netPrimary = network?.interface_name || "Active";
  const netPackets = network?.packets_recv ? `${network.packets_recv.toLocaleString()} pkts` : "Online";

  // Battery values
  const hasBattery = battery !== undefined && battery !== null && battery.percent !== undefined;
  const batteryPercent = hasBattery ? Math.round(battery.percent) : undefined;
  const batteryPrimary = hasBattery ? `${batteryPercent}%` : "N/A";
  const batterySecondary = hasBattery ? (battery.is_charging ? "Charging" : "Discharging") : "AC Connected";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
      {/* Header */}
      <OperationalHeader
        title="Operations Command Center"
        subtitle="Live host telemetry, subsystem health, and authorization control"
      />

      {/* Primary Metrics Group */}
      <section aria-label="System Metrics" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <TelemetryMetricCard
          id="cpu-metric"
          type="cpu"
          title="CPU Usage"
          icon={<CpuIcon size={16} />}
          primaryValue={cpuPrimary}
          secondaryValue={cpuSecondary}
          percent={cpuPercent}
          statusText={cpuPercent > 80 ? "HIGH LOAD" : "NORMAL"}
          inspectData={{
            usage_percent: cpuPercent,
            cores_count: cpu?.cores_count ?? cpu?.cores_usage?.length ?? 0,
            cores_usage: cpu?.cores_usage || [],
            temperature: cpu?.temperature ? `${cpu.temperature} °C` : undefined,
            frequency_mhz: cpu?.frequency_mhz ? `${cpu.frequency_mhz} MHz` : undefined,
            brand: cpu?.brand,
            physical_cores: cpu?.physical_cores,
          }}
        />

        <TelemetryMetricCard
          id="ram-metric"
          type="ram"
          title="Memory (RAM)"
          icon={<DatabaseIcon size={16} />}
          primaryValue={ramPrimary}
          secondaryValue={ramSecondary}
          percent={ramPercent}
          statusText={ramPercent > 85 ? "PRESSURE" : "NORMAL"}
          inspectData={{
            used_mb: ram?.used_mb,
            total_mb: ram?.total_mb,
            free_mb: ram?.free_mb,
            usage_percent: ramPercent,
          }}
        />

        <TelemetryMetricCard
          id="disk-metric"
          type="disk"
          title="Storage / Disk"
          icon={<HardDriveIcon size={16} />}
          primaryValue={diskPrimary}
          secondaryValue={diskSecondary}
          percent={diskPercent}
          statusText={diskPercent && diskPercent > 90 ? "CRITICAL" : "HEALTHY"}
          inspectData={{
            disks: disks || [],
            primary: primaryDisk || {},
          }}
        />

        <TelemetryMetricCard
          id="network-metric"
          type="network"
          title="Network Adapter"
          icon={<WifiIcon size={16} />}
          primaryValue={netPrimary}
          secondaryValue={netPackets}
          statusText="CONNECTED"
          inspectData={{
            interface: network?.interface_name,
            bytes_sent: network?.bytes_sent,
            bytes_recv: network?.bytes_recv,
            packets_sent: network?.packets_sent,
            packets_recv: network?.packets_recv,
          }}
        />

        <TelemetryMetricCard
          id="battery-metric"
          type="battery"
          title="Battery / Power"
          icon={<BatteryIcon size={16} />}
          primaryValue={batteryPrimary}
          secondaryValue={batterySecondary}
          percent={batteryPercent}
          statusText={hasBattery ? (battery.is_charging ? "CHARGING" : "DISCHARGING") : "AC POWER"}
          statusSeverity={hasBattery && batteryPercent !== undefined && batteryPercent < 20 ? "warning" : "normal"}
          inspectData={{
            has_battery: hasBattery,
            percent: batteryPercent,
            is_charging: battery?.is_charging,
            time_remaining: battery?.time_remaining_minutes,
          }}
        />
      </section>

      {/* Grid: Subsystems & Quick Actions (Left) / Guardian & Activity (Right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SubsystemsStatusCard snapshot={snapshot} connectionState={connectionState} />
          <QuickActionsCard />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <GuardianSummaryCard snapshot={snapshot} />
          <RecentActivityFeed limit={7} />
        </div>
      </div>
    </div>
  );
};
