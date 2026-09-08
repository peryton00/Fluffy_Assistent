/**
 * Fluffy Desktop - Network Node Card Component
 * 
 * Displays a discovered LAN machine node, online state, IP:port address,
 * target activation switch, and node removal trigger.
 */

import React, { useState } from "react";
import type { NetworkMachine } from "../../../types/contracts";
import { useNetworkStore, networkStore } from "../../../stores/networkStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { ServerIcon, TrashIcon, CheckCircleIcon } from "../../../components/common/Icons";

interface NetworkNodeCardProps {
  machine: NetworkMachine;
  isActive?: boolean;
}

export const NetworkNodeCard: React.FC<NetworkNodeCardProps> = ({ machine, isActive: propIsActive }) => {
  const activeMachineId = useNetworkStore((s) => s.activeMachineId);
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const machineKey = machine.machine_id || `${machine.ip}:${machine.port}`;
  const isActive = propIsActive !== undefined ? propIsActive : activeMachineId === machineKey;
  const isSelected = selectedItem?.type === "machine" && selectedItem?.id === machineKey;

  const handleSelect = () => {
    uiStore.setSelectedItem({
      type: "machine",
      id: machine.machine_id,
      title: `LAN Machine: ${machine.name || machine.ip}`,
      data: {
        machine_id: machine.machine_id,
        name: machine.name || "Remote Node",
        ip: machine.ip,
        port: machine.port,
        online: machine.online ? "Online" : "Offline",
        status: isActive ? "Active Monitoring Target" : "Standby",
      },
    }, true);
  };

  const handleSwitch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSwitching(true);
    try {
      await networkStore.switchTarget(machine.machine_id);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRemoving(true);
    try {
      await networkStore.removeNode(machine.machine_id);
    } finally {
      setIsRemoving(false);
    }
  };

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
      aria-label={`Inspect ${machine.name || machine.ip}`}
      style={{
        backgroundColor: isSelected ? "var(--color-surface-elevated)" : "var(--color-surface)",
        border: `1px solid ${isActive ? "var(--color-accent)" : isSelected ? "var(--color-border-strong)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        cursor: "pointer",
        transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isActive) e.currentTarget.style.borderColor = "var(--color-border-strong)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isActive) e.currentTarget.style.borderColor = "var(--color-border)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
          >
            <ServerIcon size={16} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                {machine.name || "LAN Machine"}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: "var(--font-weight-bold)",
                  padding: "1px 5px",
                  borderRadius: "2px",
                  color: machine.online ? "var(--color-success)" : "var(--color-text-muted)",
                  backgroundColor: machine.online ? "rgba(16, 185, 129, 0.1)" : "var(--color-surface-elevated)",
                }}
              >
                {machine.online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", margin: "2px 0 0 0" }}>
              {machine.ip}:{machine.port}
            </p>
          </div>
        </div>

        {isActive && (
          <span
            style={{
              fontSize: "10px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              gap: "3px",
              backgroundColor: "rgba(124, 58, 237, 0.12)",
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
            }}
          >
            <CheckCircleIcon size={12} />
            <span>ACTIVE TARGET</span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-2)", borderTop: "1px solid var(--color-border-subtle)" }}>
        {!isActive ? (
          <button
            type="button"
            disabled={isSwitching}
            onClick={handleSwitch}
            style={{
              padding: "3px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: isSwitching ? "not-allowed" : "pointer",
            }}
          >
            {isSwitching ? "Switching..." : "Switch to Target"}
          </button>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
            Inspecting Telemetry
          </span>
        )}

        <button
          type="button"
          disabled={isRemoving}
          onClick={handleRemove}
          title="Remove machine from watch list"
          aria-label="Remove machine"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            backgroundColor: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: isRemoving ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  );
};
