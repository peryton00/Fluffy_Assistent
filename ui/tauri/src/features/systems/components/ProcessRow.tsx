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
import { CloseIcon, ChevronRightIcon, ChevronDownIcon } from "../../../components/common/Icons";

interface ProcessRowProps {
  process: ProcessTelemetry;
  indent?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  childCount?: number;
  totalRamMb?: number;
  totalCpuPercent?: number;
  totalDiskKb?: number;
  onToggleExpand?: (e: React.MouseEvent) => void;
}

export const ProcessRow: React.FC<ProcessRowProps> = ({
  process,
  indent = 0,
  hasChildren = false,
  isExpanded = false,
  childCount = 0,
  totalRamMb,
  totalCpuPercent,
  totalDiskKb,
  onToggleExpand,
}) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isKilling, setIsKilling] = useState(false);

  const isSelected = selectedItem?.type === "process" && selectedItem?.id === String(process.pid);

  // Compute effective working set (aggregating child processes for parent tree nodes)
  const effectiveRamMb = hasChildren && totalRamMb !== undefined ? totalRamMb : (process.ram_mb || 0);
  const ramFormatted = effectiveRamMb >= 1024
    ? `${(effectiveRamMb / 1024).toFixed(2)} GB`
    : `${Math.round(effectiveRamMb)} MB`;

  // Compute effective CPU
  const effectiveCpu = hasChildren && totalCpuPercent !== undefined ? totalCpuPercent : (process.cpu_percent || 0);
  const cpuPercent = Math.min(100, Math.max(0, effectiveCpu));

  // Compute effective Disk I/O (handling read_kb, written_kb, disk_usage_mb and aggregate totals)
  const selfDiskKb =
    (process.disk_read_kb || 0) +
    (process.disk_written_kb || 0) +
    ((process.disk_usage_mb || 0) * 1024);
  const effectiveDiskKb = hasChildren && totalDiskKb !== undefined ? totalDiskKb : selfDiskKb;
  const diskFormatted = effectiveDiskKb >= 1024 * 1024
    ? `${(effectiveDiskKb / (1024 * 1024)).toFixed(2)} GB`
    : effectiveDiskKb >= 1024
    ? `${(effectiveDiskKb / 1024).toFixed(1)} MB`
    : effectiveDiskKb > 0
    ? `${Math.round(effectiveDiskKb)} KB`
    : "0 KB";

  const handleSelect = (e: React.MouseEvent) => {
    uiStore.setSelectedItem({
      type: "process",
      id: String(process.pid),
      title: `${process.name} (PID ${process.pid})`,
      data: {
        pid: process.pid,
        name: process.name,
        cpu_percent: `${cpuPercent.toFixed(1)}%`,
        ram_mb: ramFormatted,
        disk_usage: diskFormatted,
        status: process.status,
        user: process.user,
        parent_pid: process.parent_pid,
        net_received: process.net_received,
        net_sent: process.net_sent,
        start_time: process.start_time,
        ...(hasChildren ? { linked_children_count: childCount } : {}),
      },
    }, true);

    if (hasChildren && onToggleExpand) {
      onToggleExpand(e);
    }
  };

  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsKilling(true);
    try {
      await killProcess(process.pid);
      await telemetryCoordinator.refreshNow();
      if (uiStore.getState().selectedItem?.id === String(process.pid)) {
        uiStore.setSelectedItem(null, false);
      }
    } finally {
      setIsKilling(false);
    }
  };

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

      {/* Process Name (with collapsible tree indentation and child count) */}
      <td style={{ padding: "6px 10px", color: "var(--color-text)", fontWeight: "var(--font-weight-medium)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", paddingLeft: `${indent * 18}px` }}>
          {indent > 0 && <span style={{ color: "var(--color-text-muted)", marginRight: "2px" }}>└─</span>}

          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.(e);
              }}
              title={isExpanded ? "Collapse child processes" : "Expand child processes"}
              aria-label={isExpanded ? `Collapse ${childCount} child processes` : `Expand ${childCount} child processes`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "16px",
                height: "16px",
                padding: 0,
                border: "none",
                borderRadius: "var(--radius-xs)",
                backgroundColor: isExpanded ? "rgba(99, 102, 241, 0.15)" : "var(--color-surface-subtle)",
                color: isExpanded ? "var(--color-accent)" : "var(--color-text-muted)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "all var(--transition-fast)",
              }}
            >
              {isExpanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
            </button>
          ) : indent > 0 ? (
            <span style={{ width: "16px", display: "inline-block", flexShrink: 0 }} />
          ) : null}

          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {process.name}
          </span>

          {hasChildren && childCount > 0 && (
            <span
              style={{
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fontWeight: "var(--font-weight-semibold)",
                color: isExpanded ? "var(--color-accent)" : "var(--color-text-muted)",
                backgroundColor: isExpanded ? "rgba(99, 102, 241, 0.12)" : "var(--color-surface-subtle)",
                border: `1px solid ${isExpanded ? "rgba(99, 102, 241, 0.25)" : "var(--color-border-subtle)"}`,
                padding: "0px 4px",
                borderRadius: "var(--radius-xs)",
                marginLeft: "3px",
              }}
            >
              {childCount}
            </span>
          )}
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

      {/* Memory Consumption (Working Set) */}
      <td style={{ padding: "6px 10px", width: "100px", textAlign: "right", color: hasChildren ? "var(--color-text)" : "var(--color-text-secondary)" }}>
        {ramFormatted}
      </td>

      {/* Disk Usage */}
      <td style={{ padding: "6px 10px", width: "80px", textAlign: "right", color: "var(--color-text-muted)" }}>
        {diskFormatted}
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
