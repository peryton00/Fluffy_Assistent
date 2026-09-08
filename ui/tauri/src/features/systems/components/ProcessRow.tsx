/**
 * Fluffy Desktop - Process Row Component
 * 
 * High-performance, memory-efficient process table row.
 * Displays PID, process name, CPU% progress meter, memory consumption, and terminate action.
 */

import React, { useState } from "react";
import type { ProcessTelemetry } from "../../../types/contracts";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { killProcess } from "../../../services/api/systems";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { CloseIcon } from "../../../components/common/Icons";

interface ProcessRowProps {
  process: ProcessTelemetry;
  indent?: number;
}

export const ProcessRow: React.FC<ProcessRowProps> = ({ process, indent = 0 }) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isKilling, setIsKilling] = useState(false);

  const isSelected = selectedItem?.type === "process" && selectedItem?.id === String(process.pid);

  const handleSelect = () => {
    uiStore.setSelectedItem({
      type: "process",
      id: String(process.pid),
      title: `${process.name} (PID ${process.pid})`,
      data: {
        pid: process.pid,
        name: process.name,
        cpu_percent: process.cpu_percent,
        ram_mb: process.ram_mb,
        disk_usage_mb: process.disk_usage_mb,
        status: process.status,
        user: process.user,
        parent_pid: process.parent_pid,
        net_received: process.net_received,
        net_sent: process.net_sent,
        start_time: process.start_time,
      },
    }, true);
  };

  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsKilling(true);
    try {
      await killProcess(process.pid);
      await telemetryCoordinator.refreshNow();
    } finally {
      setIsKilling(false);
    }
  };

  const cpuPercent = Math.min(100, Math.max(0, process.cpu_percent || 0));
  const ramMb = process.ram_mb ? Math.round(process.ram_mb) : 0;

  return (
    <tr
      onClick={handleSelect}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "transparent",
        cursor: "pointer",
        transition: "background-color var(--transition-fast)",
        borderBottom: "1px solid var(--color-border-subtle)",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* PID */}
      <td style={{ padding: "6px 10px", color: "var(--color-text-muted)", width: "70px" }}>
        {process.pid}
      </td>

      {/* Process Name (with tree indentation if applicable) */}
      <td style={{ padding: "6px 10px", color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
        <div style={{ display: "flex", alignItems: "center", paddingLeft: `${indent * 16}px` }}>
          {indent > 0 && <span style={{ color: "var(--color-text-muted)", marginRight: "6px" }}>└─</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {process.name}
          </span>
        </div>
      </td>

      {/* CPU Usage Meter */}
      <td style={{ padding: "6px 10px", width: "130px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "36px", textAlign: "right" }}>{cpuPercent.toFixed(1)}%</span>
          <div style={{ flex: 1, height: "4px", backgroundColor: "var(--color-surface-elevated)", borderRadius: "2px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${cpuPercent}%`,
                backgroundColor: cpuPercent > 50 ? "var(--color-danger)" : cpuPercent > 20 ? "var(--color-warning)" : "var(--color-accent)",
              }}
            />
          </div>
        </div>
      </td>

      {/* Memory Consumption */}
      <td style={{ padding: "6px 10px", width: "100px", textAlign: "right" }}>
        {ramMb > 1024 ? `${(ramMb / 1024).toFixed(2)} GB` : `${ramMb} MB`}
      </td>

      {/* Disk Usage */}
      <td style={{ padding: "6px 10px", width: "80px", textAlign: "right", color: "var(--color-text-muted)" }}>
        {process.disk_usage_mb ? `${process.disk_usage_mb.toFixed(1)} MB` : "—"}
      </td>

      {/* Network Rx/Tx */}
      <td style={{ padding: "6px 10px", width: "110px", textAlign: "right", color: "var(--color-text-muted)" }}>
        {process.net_received || process.net_sent
          ? `↓${process.net_received || 0} ↑${process.net_sent || 0}`
          : "—"}
      </td>

      {/* Status */}
      <td style={{ padding: "6px 10px", width: "80px" }}>
        <span
          style={{
            fontSize: "9px",
            fontWeight: "var(--font-weight-bold)",
            textTransform: "uppercase",
            padding: "1px 5px",
            borderRadius: "2px",
            color: "var(--color-success)",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
          }}
        >
          {process.status || "RUNNING"}
        </span>
      </td>

      {/* Quick Action: Kill */}
      <td style={{ padding: "6px 10px", width: "50px", textAlign: "center" }}>
        <button
          type="button"
          disabled={isKilling}
          onClick={handleKill}
          title={`Terminate ${process.name} (PID ${process.pid})`}
          aria-label={`Terminate ${process.name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "transparent",
            border: "1px solid transparent",
            color: "var(--color-text-muted)",
            cursor: isKilling ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
            e.currentTarget.style.color = "var(--color-danger)";
            e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--color-text-muted)";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <CloseIcon size={11} />
        </button>
      </td>
    </tr>
  );
};
