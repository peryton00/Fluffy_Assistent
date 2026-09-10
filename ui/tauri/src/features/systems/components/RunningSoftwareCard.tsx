/**
 * Fluffy Desktop - Running Software Card Component
 * 
 * Represents an active parent application grouping all linked child processes.
 * Clicking the tile opens the Contextual Inspector side panel with the full child processes list.
 */

import React, { useState } from "react";
import type { ProcessTelemetry } from "../../../types/contracts";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { killProcess } from "../../../services/api/systems";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { CpuIcon, DatabaseIcon, XCircleIcon, LayersIcon, ChevronRightIcon } from "../../../components/common/Icons";

export interface RunningAppGroup {
  id: string;
  name: string;
  rootPid: number;
  totalCpu: number;
  totalRam: number;
  processCount: number;
  children: ProcessTelemetry[];
  rootProcess: ProcessTelemetry;
}

interface RunningSoftwareCardProps {
  group: RunningAppGroup;
}

export const RunningSoftwareCard: React.FC<RunningSoftwareCardProps> = ({ group }) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isTerminating, setIsTerminating] = useState(false);

  const isSelected = selectedItem?.type === "runningApplication" && selectedItem?.id === group.id;

  const handleSelect = () => {
    uiStore.setSelectedItem({
      type: "runningApplication",
      id: group.id,
      title: `Application: ${group.name}`,
      data: {
        name: group.name,
        root_pid: group.rootPid,
        total_cpu: `${group.totalCpu.toFixed(1)}%`,
        total_ram: group.totalRam >= 1024 ? `${(group.totalRam / 1024).toFixed(1)} GB` : `${Math.round(group.totalRam)} MB`,
        process_count: group.processCount,
        children: group.children as unknown as Record<string, unknown>[],
      },
    }, true);
  };

  const handleTerminateAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTerminating(true);
    try {
      // Terminate all child processes in the application group
      await Promise.allSettled(group.children.map((child) => killProcess(child.pid)));
      await telemetryCoordinator.refreshNow();
      if (uiStore.getState().selectedItem?.id === group.name) {
        uiStore.setSelectedItem(null, false);
      }
    } finally {
      setIsTerminating(false);
    }
  };

  const ramFormatted = group.totalRam >= 1024
    ? `${(group.totalRam / 1024).toFixed(1)} GB`
    : `${Math.round(group.totalRam)} MB`;

  const cpuVal = group.totalCpu.toFixed(1);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-label={`Inspect running application ${group.name} and its child processes`}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
        border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        cursor: "pointer",
        transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = "var(--color-border-strong)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = "var(--color-border)";
      }}
    >
      {/* Header: Application Name, Root PID & Child Count */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "var(--color-success)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <h3
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              {group.name}
            </h3>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginLeft: "13px", marginTop: "1px" }}>
            Parent PID: {group.rootPid}
          </div>
        </div>

        <span
          style={{
            fontSize: "10px",
            fontWeight: "var(--font-weight-semibold)",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: group.processCount > 1 ? "rgba(99, 102, 241, 0.12)" : "var(--color-surface-subtle)",
            color: group.processCount > 1 ? "var(--color-accent)" : "var(--color-text-muted)",
            border: `1px solid ${group.processCount > 1 ? "rgba(99, 102, 241, 0.25)" : "var(--color-border-subtle)"}`,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
          }}
        >
          {group.processCount > 1 && <LayersIcon size={10} />}
          <span>{group.processCount} {group.processCount === 1 ? "proc" : "procs"}</span>
        </span>
      </div>

      {/* Metrics Row: Aggregated CPU & RAM */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-2)",
          backgroundColor: "var(--color-surface-subtle)",
          padding: "var(--space-2)",
          borderRadius: "var(--radius-xs)",
          border: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <CpuIcon size={12} style={{ color: "var(--color-accent)" }} />
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
            {cpuVal}%
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <DatabaseIcon size={12} style={{ color: "var(--color-text-muted)" }} />
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
            {ramFormatted}
          </span>
        </div>
      </div>

      {/* Footer: View Children Prompt & End All Button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "var(--space-1)",
          borderTop: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px", color: "var(--color-accent)" }}>
          <span>View children</span>
          <ChevronRightIcon size={10} />
        </div>

        <button
          type="button"
          disabled={isTerminating}
          onClick={handleTerminateAll}
          title={`End all ${group.processCount} processes for ${group.name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            fontSize: "10px",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text-muted)",
            cursor: isTerminating ? "not-allowed" : "pointer",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-danger)";
            e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-text-muted)";
            e.currentTarget.style.borderColor = "var(--color-border)";
          }}
        >
          <XCircleIcon size={11} />
          <span>{isTerminating ? "Stopping..." : "End All"}</span>
        </button>
      </div>
    </div>
  );
};
