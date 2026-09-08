/**
 * Fluffy Desktop - Guardian Event Row Component
 *
 * Renders an individual anomaly detection verdict, security alert, or audit log entry.
 * Supports quick mitigation actions: Trust process, Ignore, or Mark Dangerous.
 */

import React, { useState } from "react";
import type { GuardianVerdict, SecurityAlert, LogEntry } from "../../../types/contracts";
import { guardianStore } from "../../../stores/guardianStore";
import { useUiStore, uiStore } from "../../../stores/uiStore";
import { ShieldAlertIcon, ShieldCheckIcon, AlertTriangleIcon, InfoIcon } from "../../../components/common/Icons";

interface GuardianEventRowProps {
  verdict?: GuardianVerdict;
  alert?: SecurityAlert;
  entry?: LogEntry;
  onSelect?: (item: unknown) => void;
}

export const GuardianEventRow: React.FC<GuardianEventRowProps> = ({ verdict, alert, entry, onSelect }) => {
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [isActing, setIsActing] = useState(false);

  const rowBase: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3)",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-xs)",
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "var(--space-3)",
    fontSize: "var(--font-size-xs)",
    transition: "border-color var(--transition-fast)",
    flexWrap: "wrap",
  };

  // Log entry rendering
  if (entry) {
    const isError = entry.level?.toLowerCase() === "error";
    const isWarning = entry.level?.toLowerCase() === "warning" || entry.level?.toLowerCase() === "warn";

    const levelStyle: React.CSSProperties = isError
      ? { color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)" }
      : isWarning
      ? { color: "var(--color-warning)", backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)" }
      : { color: "var(--color-text-muted)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" };

    return (
      <div onClick={() => onSelect && onSelect(entry)} style={rowBase}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", flex: "1 1 0%", minWidth: 0 }}>
          <span
            style={{
              display: "flex",
              flexShrink: 0,
              marginTop: "2px",
              color: isError ? "var(--color-danger)" : isWarning ? "var(--color-warning)" : "var(--color-text-muted)",
            }}
          >
            {isError ? <ShieldAlertIcon size={14} /> : isWarning ? <AlertTriangleIcon size={14} /> : <InfoIcon size={14} />}
          </span>

          <div style={{ minWidth: 0, flex: "1 1 0%", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)", fontWeight: "var(--font-weight-semibold)" }}>
                {entry.module || "System"}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  ...levelStyle,
                }}
              >
                {entry.level}
              </span>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                {entry.timestamp}
              </span>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", margin: 0, wordBreak: "break-word" }}>
              {entry.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Verdict / Alert rendering
  const processName = verdict?.process || alert?.process_name || "System Process";
  const pid = verdict?.pid || alert?.process_id;
  const reason = verdict?.reason || alert?.message || "Unusual behavioral pattern detected";
  const level = (verdict?.level || alert?.severity || "ANOMALY").toUpperCase();
  const eventId = String(alert?.id || `${processName}-${pid || "0"}`);

  const isSelected =
    (selectedItem?.type === "guardianAlert" || selectedItem?.type === "guardianEvent") &&
    selectedItem?.id === eventId;

  const handleSelect = () => {
    if (onSelect) {
      onSelect(alert || verdict);
      return;
    }
    uiStore.setSelectedItem(
      {
        type: alert ? "guardianAlert" : "guardianEvent",
        id: eventId,
        title: `${level}: ${processName}`,
        data: {
          process_name: processName,
          pid: pid || "Unknown",
          severity_level: level,
          reason,
          timestamp: alert?.timestamp || verdict?.timestamp || "Active",
          details: alert?.details || verdict || {},
        },
      },
      true
    );
  };

  const handleTrust = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActing(true);
    try {
      if (pid) {
        await guardianStore.takeSecurityAction(pid, "trust");
      } else {
        await guardianStore.trustProcess(processName);
      }
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      onClick={handleSelect}
      style={{
        ...rowBase,
        border: `1px solid ${isSelected ? "color-mix(in srgb, var(--color-accent) 50%, transparent)" : "var(--color-border)"}`,
        boxShadow: isSelected ? "0 0 0 1px color-mix(in srgb, var(--color-accent) 25%, transparent)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", flex: "1 1 0%", minWidth: 0 }}>
        <span style={{ color: "var(--color-warning)", display: "flex", flexShrink: 0, marginTop: "2px" }}>
          <ShieldAlertIcon size={14} />
        </span>
        <div style={{ minWidth: 0, flex: "1 1 0%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>{processName}</span>
            {pid && (
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                PID: {pid}
              </span>
            )}
            <span
              style={{
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "1px 5px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
                color: "var(--color-warning)",
                border: "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)",
              }}
            >
              {level}
            </span>
          </div>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", margin: "2px 0 0" }}>{reason}</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0, alignSelf: "center" }}>
        <button
          type="button"
          disabled={isActing}
          onClick={handleTrust}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 10px",
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "color-mix(in srgb, var(--color-success) 15%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-success)",
            cursor: isActing ? "wait" : "pointer",
            opacity: isActing ? 0.5 : 1,
          }}
        >
          <ShieldCheckIcon size={12} />
          Trust
        </button>
      </div>
    </div>
  );
};
