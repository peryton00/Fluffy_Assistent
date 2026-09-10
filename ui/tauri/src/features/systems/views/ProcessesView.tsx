/**
 * Fluffy Desktop - Processes Explorer View
 * 
 * Deep process management surface supporting flat list & hierarchical tree modes,
 * column sorting, search filtering, and safe process termination.
 */

import React, { useState } from "react";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import type { ProcessTelemetry } from "../../../types/contracts";
import { SystemsHeader } from "../components/SystemsHeader";
import { ProcessRow } from "../components/ProcessRow";
import { ProcessTree } from "../components/ProcessTree";
import { SearchIcon, ListIcon, LayersIcon } from "../../../components/common/Icons";

type SortField = "cpu" | "ram" | "pid" | "name" | "disk" | "net";
type SortOrder = "asc" | "desc";

export const ProcessesView: React.FC = () => {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTreeMode, setIsTreeMode] = useState(false);
  const [sortField, setSortField] = useState<SortField>("cpu");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Extract process list (top_cpu or top_ram from backend status)
  const processGroup = snapshot?.system?.processes || snapshot?.processes;
  const rawList: ProcessTelemetry[] = processGroup?.top_cpu || processGroup?.top_ram || [];

  // Deduplicate by PID if both lists were merged
  const procMap = new Map<number, ProcessTelemetry>();
  rawList.forEach((p) => procMap.set(p.pid, p));
  const processes = Array.from(procMap.values());

  // Filter by search query
  const filtered = processes.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      String(p.pid).includes(q) ||
      (p.user && p.user.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  });

  // Sort filtered list
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    switch (sortField) {
      case "cpu":
        diff = (a.cpu_percent || 0) - (b.cpu_percent || 0);
        break;
      case "ram":
        diff = (a.ram_mb || 0) - (b.ram_mb || 0);
        break;
      case "pid":
        diff = a.pid - b.pid;
        break;
      case "name":
        diff = a.name.localeCompare(b.name);
        break;
      case "disk": {
        const diskA = (a.disk_read_kb || 0) + (a.disk_written_kb || 0) + ((a.disk_usage_mb || 0) * 1024);
        const diskB = (b.disk_read_kb || 0) + (b.disk_written_kb || 0) + ((b.disk_usage_mb || 0) * 1024);
        diff = diskA - diskB;
        break;
      }
      case "net":
        diff = (a.net_received || 0) + (a.net_sent || 0) - ((b.net_received || 0) + (b.net_sent || 0));
        break;
    }
    return sortOrder === "desc" ? -diff : diff;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === "desc" ? " ▼" : " ▲";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", width: "100%", height: "100%" }}>
      <SystemsHeader
        title="Process Explorer"
        subtitle="Active host process hierarchy, working sets, and execution control"
      />

      {/* Controls Bar: Search & View Mode Toggle */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 240px", maxWidth: "360px" }}>
          <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter processes by name, PID, or user..."
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              fontSize: "12px",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-subtle)", padding: "1px" }}>
            <button
              type="button"
              onClick={() => setIsTreeMode(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: !isTreeMode ? "var(--color-accent)" : "transparent",
                color: !isTreeMode ? "#ffffff" : "var(--color-text-muted)",
                border: "none",
                borderRadius: "var(--radius-xs)",
                cursor: "pointer",
              }}
            >
              <ListIcon size={12} />
              <span>Flat</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTreeMode(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: isTreeMode ? "var(--color-accent)" : "transparent",
                color: isTreeMode ? "#ffffff" : "var(--color-text-muted)",
                border: "none",
                borderRadius: "var(--radius-xs)",
                cursor: "pointer",
              }}
            >
              <LayersIcon size={12} />
              <span>Tree</span>
            </button>
          </div>

          <span
            style={{
              fontSize: "10px",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text-muted)",
              backgroundColor: "var(--color-surface-elevated)",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {sorted.length} {sorted.length === 1 ? "Process" : "Processes"}
          </span>
        </div>
      </div>

      {/* Processes Table Canvas */}
      <div
        style={{
          flex: 1,
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          overflowY: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--color-surface-elevated)", zIndex: 10 }}>
            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
              <th onClick={() => handleSort("pid")} style={{ padding: "8px 10px", cursor: "pointer", width: "70px" }}>
                PID{getSortIndicator("pid")}
              </th>
              <th onClick={() => handleSort("name")} style={{ padding: "8px 10px", cursor: "pointer" }}>
                NAME{getSortIndicator("name")}
              </th>
              <th onClick={() => handleSort("cpu")} style={{ padding: "8px 10px", cursor: "pointer", width: "130px" }}>
                CPU LOAD{getSortIndicator("cpu")}
              </th>
              <th onClick={() => handleSort("ram")} style={{ padding: "8px 10px", cursor: "pointer", width: "100px", textAlign: "right" }}>
                WORKING SET{getSortIndicator("ram")}
              </th>
              <th onClick={() => handleSort("disk")} style={{ padding: "8px 10px", cursor: "pointer", width: "80px", textAlign: "right" }}>
                DISK{getSortIndicator("disk")}
              </th>
              <th onClick={() => handleSort("net")} style={{ padding: "8px 10px", cursor: "pointer", width: "110px", textAlign: "right" }}>
                NET RX/TX{getSortIndicator("net")}
              </th>
              <th style={{ padding: "8px 10px", width: "80px" }}>
                STATUS
              </th>
              <th style={{ padding: "8px 10px", width: "50px", textAlign: "center" }}>
                KILL
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {searchQuery ? "No processes match search query" : "No running processes recorded"}
                </td>
              </tr>
            ) : isTreeMode ? (
              <ProcessTree processes={sorted} />
            ) : (
              sorted.map((proc) => <ProcessRow key={proc.pid} process={proc} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
