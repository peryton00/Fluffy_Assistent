/**
 * Fluffy Desktop - Guardian History View
 *
 * Audit trail of security decisions, policy executions, anomaly evaluations,
 * and elevated command authorization events.
 */

import React, { useState, useEffect } from "react";
import { useUIStore } from "../../../stores/uiStore";
import { fetchLogs } from "../../../services/api/operations";
import { GuardianEventRow } from "../components/GuardianEventRow";
import {
  ShieldAlertIcon,
  SearchIcon,
  RefreshIcon,
  FilterIcon,
} from "../../../components/common/Icons";
import type { LogEntry } from "../../../types/contracts";

export const GuardianHistoryView: React.FC = () => {
  const { setInspectorItem } = useUIStore();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const resp = await fetchLogs();
      if (Array.isArray(resp)) setLogs(resp);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAuditLogs(); }, []);

  const securityLogs = logs.filter((l) => {
    const isSecurity =
      l.module?.toLowerCase().includes("guardian") ||
      l.module?.toLowerCase().includes("security") ||
      l.module?.toLowerCase().includes("auth") ||
      l.message?.toLowerCase().includes("guardian") ||
      l.message?.toLowerCase().includes("kill") ||
      l.message?.toLowerCase().includes("anomaly") ||
      l.message?.toLowerCase().includes("trusted") ||
      l.message?.toLowerCase().includes("confirm") ||
      l.level?.toLowerCase() === "warning" ||
      l.level?.toLowerCase() === "error";

    if (filterType === "security_only" && !isSecurity) return false;
    if (filterType === "warnings_errors" && l.level !== "WARNING" && l.level !== "ERROR") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.module?.toLowerCase().includes(q) ||
        l.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const card: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Controls */}
      <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Search security audit logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: "32px",
              paddingRight: "12px",
              paddingTop: "7px",
              paddingBottom: "7px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {/* Filter select */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              padding: "4px 10px",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-secondary)",
            }}
          >
            <FilterIcon size={12} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text)",
                fontSize: "var(--font-size-xs)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Audit Entries</option>
              <option value="security_only">Security Events Only</option>
              <option value="warnings_errors">Warnings & Errors</option>
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={loadAuditLogs}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 10px",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-secondary)",
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshIcon size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {/* Audit Log Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
            Showing {securityLogs.length} audit entries
          </span>
        </div>

        {loading && logs.length === 0 ? (
          <div
            style={{
              ...card,
              padding: "var(--space-6)",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            Loading security audit history...
          </div>
        ) : securityLogs.length === 0 ? (
          <div
            style={{
              ...card,
              padding: "var(--space-6)",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <ShieldAlertIcon size={28} />
            <span>No audit logs matching the current filter.</span>
          </div>
        ) : (
          securityLogs.map((entry, idx) => (
            <GuardianEventRow
              key={`${entry.timestamp}-${idx}`}
              entry={entry}
              onSelect={() =>
                setInspectorItem({
                  id: `audit-${entry.timestamp}-${idx}`,
                  type: "guardianEvent",
                  title: `Audit Event: ${entry.module || "System"}`,
                  data: entry as unknown as Record<string, unknown>,
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
};
