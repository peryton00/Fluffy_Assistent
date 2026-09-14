/**
 * Fluffy Desktop - Network Topology Toolbar (Phase N9)
 * 
 * Provides mode switching, deterministic filtering, search query input,
 * zoom/pan canvas controls, and real-time topology health metrics.
 * 
 * Zero Emojis, Zero N10+ functionality.
 */

import React from "react";
import type { TopologyMode, TopologyFilterState } from "./topologyModel";
import {
  NetworkIcon,
  CpuIcon,
  ActivityIcon,
  ShieldIcon,
  SearchIcon,
  PlusIcon,
  MinusIcon,
  Maximize2Icon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
} from "../../../components/common/Icons";

interface TopologyToolbarProps {
  mode: TopologyMode;
  onModeChange: (mode: TopologyMode) => void;
  filters: TopologyFilterState;
  onFilterChange: (filters: TopologyFilterState) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  zoomLevel: number;
  nodeCount: number;
  edgeCount: number;
  isolatedCount: number;
  isStale: boolean;
  onResync: () => void;
}

export const TopologyToolbar: React.FC<TopologyToolbarProps> = ({
  mode,
  onModeChange,
  filters,
  onFilterChange,
  onZoomIn,
  onZoomOut,
  onFitView,
  zoomLevel,
  nodeCount,
  edgeCount,
  isolatedCount,
  isStale,
  onResync,
}) => {
  const modes: { id: TopologyMode; label: string; icon: React.ReactNode }[] = [
    { id: "cluster", label: "Cluster", icon: <CpuIcon size={14} /> },
    { id: "network", label: "Network", icon: <NetworkIcon size={14} /> },
    { id: "traffic", label: "Traffic", icon: <ActivityIcon size={14} /> },
    { id: "security", label: "Security", icon: <ShieldIcon size={14} /> },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}
    >
      {/* Top Row: Modes + Search + Canvas Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        {/* Topology Mode Switcher */}
        <div
          role="tablist"
          aria-label="Topology Mode Selection"
          style={{
            display: "inline-flex",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "2px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border)",
          }}
        >
          {modes.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onModeChange(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  backgroundColor: isActive ? "var(--color-surface)" : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Query Input */}
        <div style={{ position: "relative", minWidth: "220px", flex: "1 1 auto", maxWidth: "340px" }}>
          <SearchIcon
            size={14}
            style={{
              position: "absolute",
              left: "var(--space-3)",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Filter by name, IP, MAC..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            style={{
              width: "100%",
              padding: "var(--space-1) var(--space-3) var(--space-1) calc(var(--space-3) + 18px)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ ...filters, searchQuery: "" })}
              aria-label="Clear filter search query"
              style={{
                position: "absolute",
                right: "var(--space-2)",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Zoom & Canvas Navigation Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            onClick={onZoomOut}
            aria-label="Zoom Out"
            style={{
              padding: "var(--space-1) var(--space-2)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <MinusIcon size={14} />
          </button>
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              minWidth: "40px",
              textAlign: "center",
            }}
          >
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            aria-label="Zoom In"
            style={{
              padding: "var(--space-1) var(--space-2)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <PlusIcon size={14} />
          </button>
          <button
            onClick={onFitView}
            aria-label="Fit View"
            style={{
              padding: "var(--space-1) var(--space-2)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
            }}
          >
            <Maximize2Icon size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Topology Metadata Metrics & Filter Chips */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          fontSize: "11px",
          color: "var(--color-text-muted)",
          borderTop: "1px solid var(--color-border)",
          paddingTop: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span>
            Observed Entities: <strong style={{ color: "var(--color-text-primary)" }}>{nodeCount}</strong>
          </span>
          <span>
            Real Connections: <strong style={{ color: "var(--color-text-primary)" }}>{edgeCount}</strong>
          </span>
          <span>
            Isolated Nodes: <strong style={{ color: "var(--color-text-primary)" }}>{isolatedCount}</strong>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {isStale ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-warning)" }}>
              <AlertCircleIcon size={13} />
              <span>Topology Degraded / Resyncing</span>
              <button
                onClick={onResync}
                aria-label="Force Resync"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-accent)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 2px",
                }}
              >
                <RefreshCwIcon size={12} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-success)" }}>
              <CheckCircle2Icon size={13} />
              <span>Authoritative Projection Active</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
