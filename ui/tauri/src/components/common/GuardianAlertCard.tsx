/**
 * Fluffy Desktop - Guardian Alert & Process Confirmation Card
 * 
 * Rich, formatted presentation for behavioral anomaly detections and security confirmations.
 * Replaces unformatted raw JSON blocks with human-readable telemetry, metric deviation pills,
 * and direct one-click navigation to inspect and highlight the targeted host process.
 */

import React, { useMemo } from "react";
import type { PendingConfirmation } from "../../types/contracts";
import { uiStore } from "../../stores/uiStore";
import {
  ShieldIcon,
  CpuIcon,
  CheckIcon,
  CloseIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "./Icons";

export interface ParsedAlertInfo {
  isGuardianAlert: boolean;
  processName: string;
  pid?: number;
  metricType: "RAM" | "CPU" | "NETWORK" | "GENERIC";
  currentUsage?: string;
  baselineUsage?: string;
  deviation?: string;
  behaviors: string[];
  magnitude?: string;
  score?: number;
  reason?: string;
  explanation?: string;
  rawDetails?: string;
}

/**
 * Extracts structured telemetry and anomaly details from either structured objects
 * or unstructured string envelopes.
 */
export function parseAlertDetails(conf: PendingConfirmation): ParsedAlertInfo {
  const details = conf.details;
  const isObj = typeof details === "object" && details !== null;
  const detailsStr = typeof details === "string" ? details : conf.message || "";

  // 1. Check if this is a Guardian alert / process termination request
  const isGuardian =
    conf.command_id.startsWith("kill_") ||
    conf.command_name.toLowerCase().includes("terminate") ||
    conf.command_name.toLowerCase().includes("process") ||
    detailsStr.includes("Guardian Alert") ||
    (isObj && "process_name" in (details as Record<string, unknown>));

  // 2. Extract PID
  let pid: number | undefined = undefined;
  if (isObj && typeof (details as any).pid === "number") {
    pid = (details as any).pid;
  } else {
    const pidMatch = conf.command_id.match(/kill_(\d+)_/) || detailsStr.match(/\bPID[:#\s]+(\d+)\b/i);
    if (pidMatch) {
      pid = parseInt(pidMatch[1], 10);
    }
  }

  // 3. Extract Process Name
  let processName = "Unknown Service";
  if (isObj && typeof (details as any).process_name === "string" && (details as any).process_name) {
    processName = (details as any).process_name;
  } else if (conf.target) {
    processName = conf.target;
  } else {
    const cmdNameMatch = conf.command_name.match(/Terminate\s+(?:Suspicious\s+)?Process:\s*([^\s(]+)/i);
    if (cmdNameMatch) {
      processName = cmdNameMatch[1];
    } else {
      const procMatch = detailsStr.match(/(?:process|service)\s+["'`]?([a-zA-Z0-9._-]+)["'`]?/i);
      if (procMatch && procMatch[1].toLowerCase() !== "has" && procMatch[1].toLowerCase() !== "exceeded") {
        processName = procMatch[1];
      }
    }
  }

  // 4. Extract Metric Type & Usage Comparison
  let metricType: "RAM" | "CPU" | "NETWORK" | "GENERIC" = "GENERIC";
  let currentUsage: string | undefined;
  let baselineUsage: string | undefined;
  let deviation: string | undefined;

  const usageRegex = /(RAM|CPU|Network|Outbound)\s*(?:usage|flow)?\s*\(([^)]+)\)\s*is\s*([0-9.]+x)\s*higher than baseline\s*\(([^)]+)\)/i;
  const matchUsage = detailsStr.match(usageRegex);
  if (matchUsage) {
    const typeStr = matchUsage[1].toUpperCase();
    metricType = typeStr.includes("RAM") ? "RAM" : typeStr.includes("CPU") ? "CPU" : typeStr.includes("NET") || typeStr.includes("OUTBOUND") ? "NETWORK" : "GENERIC";
    currentUsage = matchUsage[2].trim();
    deviation = matchUsage[3].trim();
    baselineUsage = matchUsage[4].trim();
  } else if (isObj) {
    if ((details as any).ram_mb !== undefined) {
      metricType = "RAM";
      currentUsage = `${(details as any).ram_mb} MB`;
    } else if ((details as any).cpu_percent !== undefined) {
      metricType = "CPU";
      currentUsage = `${(details as any).cpu_percent}%`;
    }
  }

  // 5. Extract Contributing Behaviors
  let behaviors: string[] = [];
  if (isObj && Array.isArray((details as any).anomalies)) {
    behaviors = (details as any).anomalies
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          return String(obj.behavior || obj.name || obj.anomaly_type || obj.type || "");
        }
        return "";
      })
      .filter(Boolean);
  }
  if (behaviors.length === 0) {
    const behaviorsMatch = detailsStr.match(/Contributing behaviors:\s*([A-Z0-9_,\s]+)(?:\.|$|\n)/i);
    if (behaviorsMatch) {
      behaviors = behaviorsMatch[1]
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
    }
  }

  // 6. Extract Magnitude & Score
  let magnitude: string | undefined;
  const magMatch = detailsStr.match(/Magnitude:\s*([0-9.]+x?)/i);
  if (magMatch) magnitude = magMatch[1];

  let score: number | undefined;
  if (isObj && typeof (details as any).risk_score === "number") {
    score = (details as any).risk_score;
  } else {
    const scoreMatch = detailsStr.match(/Score:\s*([0-9.]+)/i);
    if (scoreMatch) score = parseFloat(scoreMatch[1]);
  }

  // 7. Reason & Explanation
  let reason: string | undefined;
  let explanation: string | undefined;
  if (isObj) {
    reason = (details as any).reason;
    explanation = (details as any).explanation;
  } else {
    const alertMatch = detailsStr.match(/Guardian Alert:\s*([^\n\r]+)/i);
    if (alertMatch) reason = alertMatch[1].trim();
    
    if (detailsStr.includes("This process has exceeded")) {
      explanation = "This process has exceeded the safety threshold and exhibited anomalous resource consumption.";
    }
  }

  return {
    isGuardianAlert: isGuardian,
    processName,
    pid,
    metricType,
    currentUsage,
    baselineUsage,
    deviation,
    behaviors,
    magnitude,
    score,
    reason,
    explanation,
    rawDetails: typeof details === "string" ? details : JSON.stringify(details, null, 2),
  };
}

interface GuardianAlertCardProps {
  conf: PendingConfirmation;
  onAuthorize: (id: string) => void;
  onReject: (id: string) => void;
  isBusy?: boolean;
  onNavigate?: () => void;
  compact?: boolean;
}

export const GuardianAlertCard: React.FC<GuardianAlertCardProps> = ({
  conf,
  onAuthorize,
  onReject,
  isBusy = false,
  onNavigate,
  compact = false,
}) => {
  const parsed = useMemo(() => parseAlertDetails(conf), [conf]);

  const handleInspectProcess = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1. Switch active domain to Systems -> Processes
    uiStore.setActiveDomain("systems");
    uiStore.setActiveSidebarView("processes");

    // 2. Select and highlight process in inspector
    if (parsed.pid || parsed.processName) {
      uiStore.setSelectedItem({
        type: "process",
        id: String(parsed.pid || parsed.processName),
        title: `${parsed.processName} ${parsed.pid ? `(PID ${parsed.pid})` : ""}`,
        data: {
          pid: parsed.pid || 0,
          name: parsed.processName,
          risk_score: parsed.score,
          alert_reason: parsed.reason,
          highlight_alert: true,
        },
      }, true);
    }

    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "1px solid var(--color-danger-border, rgba(239, 68, 68, 0.35))",
        borderRadius: "var(--radius-sm)",
        padding: compact ? "var(--space-2) var(--space-3)" : "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        position: "relative",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Card Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "4px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "var(--color-danger, #f7768e)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldIcon size={13} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "220px",
              }}
              title={conf.command_name || "Guardian Anomaly Alert"}
            >
              {conf.command_name || (parsed.isGuardianAlert ? "Guardian Anomaly Alert" : "System Confirmation")}
            </span>
            {conf.command_id && (
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface)",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  border: "1px solid var(--color-border)",
                  flexShrink: 0,
                }}
              >
                {conf.command_id}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {parsed.score !== undefined && (
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                fontWeight: "var(--font-weight-bold)",
                color: parsed.score >= 15 ? "var(--color-danger, #f7768e)" : "var(--color-warning, #e0af68)",
                backgroundColor: parsed.score >= 15 ? "rgba(239, 68, 68, 0.12)" : "rgba(224, 175, 104, 0.12)",
                padding: "1px 6px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              SCORE: {parsed.score}
            </span>
          )}

          <span
            style={{
              fontSize: "10px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-danger, #f7768e)",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              padding: "1px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            RISK: ELEVATED
          </span>
        </div>
      </div>

      {/* Target Service / Process Banner (Clickable with redirect & highlight) */}
      <div
        onClick={handleInspectProcess}
        title="Click to view and highlight this process in Process Explorer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderRadius: "var(--radius-xs)",
          backgroundColor: "var(--color-surface, #1a1b26)",
          border: "1px solid var(--color-accent-border, rgba(99, 102, 241, 0.4))",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
          gap: "8px",
          flexWrap: "wrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-surface-hover, rgba(99, 102, 241, 0.1))";
          e.currentTarget.style.borderColor = "var(--color-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-surface, #1a1b26)";
          e.currentTarget.style.borderColor = "var(--color-accent-border, rgba(99, 102, 241, 0.4))";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
          <CpuIcon size={14} style={{ color: "var(--color-accent, #7aa2f7)", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>Target Process:</span>
            <strong
              style={{
                fontSize: "12px",
                color: "var(--color-accent, #7aa2f7)",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "200px",
              }}
              title={parsed.processName}
            >
              {parsed.processName}
            </strong>
            {parsed.pid !== undefined && (
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface-elevated)",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  border: "1px solid var(--color-border)",
                  flexShrink: 0,
                }}
              >
                PID: {parsed.pid}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "11px",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-accent, #7aa2f7)",
            padding: "2px 6px",
            borderRadius: "3px",
            backgroundColor: "var(--color-accent-subtle, rgba(99, 102, 241, 0.15))",
            flexShrink: 0,
          }}
        >
          <span>Inspect Process</span>
          <ExternalLinkIcon size={12} />
        </div>
      </div>

      {/* Metrics & Anomaly Comparison Grid */}
      {(parsed.currentUsage || parsed.behaviors.length > 0 || parsed.reason) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: parsed.currentUsage && parsed.baselineUsage ? "1fr 1fr" : "1fr",
            gap: "6px",
            backgroundColor: "var(--color-surface-subtle, rgba(0, 0, 0, 0.2))",
            padding: "8px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05))",
          }}
        >
          {parsed.currentUsage && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Observed {parsed.metricType} Load:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-danger, #f7768e)" }}>
                  {parsed.currentUsage}
                </span>
                {parsed.deviation && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#ffffff",
                      backgroundColor: "var(--color-danger, #f7768e)",
                      padding: "1px 5px",
                      borderRadius: "3px",
                    }}
                  >
                    {parsed.deviation} deviation
                  </span>
                )}
              </div>
            </div>
          )}

          {parsed.baselineUsage && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Learned Baseline:
              </span>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                {parsed.baselineUsage}
              </span>
            </div>
          )}

          {parsed.behaviors.length > 0 && (
            <div style={{ gridColumn: parsed.currentUsage && parsed.baselineUsage ? "1 / span 2" : "1", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>Behavioral Pattern:</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {parsed.behaviors.map((b) => (
                  <span
                    key={b}
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      color: "var(--color-warning, #e0af68)",
                      backgroundColor: "rgba(224, 175, 104, 0.15)",
                      border: "1px solid rgba(224, 175, 104, 0.3)",
                      padding: "1px 5px",
                      borderRadius: "3px",
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Human Readable Explanation */}
      <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.45 }}>
        {parsed.explanation || parsed.reason || conf.message || "Guardian detected anomalous resource spikes exceeding safe operating boundaries."}
      </p>

      {/* Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", marginTop: "var(--space-1)", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleInspectProcess}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <SearchIcon size={12} />
          <span>Locate in Explorer</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onReject(conf.command_id)}
            data-command-id={conf.command_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-secondary)",
              cursor: isBusy ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <CloseIcon size={12} />
            <span>{parsed.isGuardianAlert ? "Reject / Dismiss" : "Reject"}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAuthorize(conf.command_id)}
            data-command-id={conf.command_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 12px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-bold)",
              backgroundColor: "var(--color-danger, #f7768e)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-xs)",
              color: "#ffffff",
              cursor: isBusy ? "not-allowed" : "pointer",
              boxShadow: "0 1px 4px rgba(239, 68, 68, 0.3)",
              flexShrink: 0,
            }}
          >
            <CheckIcon size={12} />
            <span>{parsed.isGuardianAlert ? "Authorize (Terminate)" : "Authorize"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
