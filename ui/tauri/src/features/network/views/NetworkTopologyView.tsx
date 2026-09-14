/**
 * Fluffy Desktop - Interactive Network Topology Workspace (Phase N9)
 * 
 * Renders real interactive network topology driven by authoritative N7 data.
 * Supports Cluster, Network, Traffic, and Security modes with deterministic
 * layout, zoom/pan navigation, unified selection sync, and typed navigation hooks.
 * 
 * Invariants:
 * - Real connections only (no invented edges).
 * - No secondary state store.
 * - Zero Emojis, Zero N10+ functionality.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useNetworkWorkspaceStore, networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { uiStore } from "../../../stores/uiStore";
import {
  projectTopology,
  type TopologyMode,
  type TopologyFilterState,
  type TopologyNode,
} from "../topology/topologyModel";
import { TopologyToolbar } from "../topology/TopologyToolbar";
import { TopologyCanvas } from "../topology/TopologyCanvas";
import { NetworkIcon } from "../../../components/common/Icons";

export const NetworkTopologyView: React.FC = () => {
  const nodes = useNetworkWorkspaceStore((s) => s.nodes);
  const devices = useNetworkWorkspaceStore((s) => s.devices);
  const interfaces = useNetworkWorkspaceStore((s) => s.interfaces);
  const connections = useNetworkWorkspaceStore((s) => s.connections);
  const traffic = useNetworkWorkspaceStore((s) => s.traffic);
  const events = useNetworkWorkspaceStore((s) => s.events);
  const status = useNetworkWorkspaceStore((s) => s.status);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);

  const [mode, setMode] = useState<TopologyMode>("network");
  const [filters, setFilters] = useState<TopologyFilterState>({
    searchQuery: "",
    entityType: "all",
    connectionKind: "all",
    availability: "all",
  });

  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Derive memoized topology projection strictly from authoritative state
  const projection = useMemo(() => {
    const safeTraffic = traffic ?? {
      rx_bytes: 0,
      tx_bytes: 0,
      rx_packets: 0,
      tx_packets: 0,
      rx_errors: 0,
      tx_errors: 0,
      rx_drops: 0,
      tx_drops: 0,
      rates: null,
      top_talkers: [],
    };

    return projectTopology(
      {
        nodes,
        devices,
        interfaces,
        connections,
        traffic: safeTraffic,
        events,
      },
      mode,
      filters,
      1000,
      640
    );
  }, [nodes, devices, interfaces, connections, traffic, events, mode, filters]);

  // Zoom & Pan controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100));
  }, []);

  const handleFitView = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // Selection & Navigation
  const handleSelectEntity = useCallback((selection: typeof selectedEntity) => {
    networkWorkspaceStore.selectEntity(selection);
  }, []);

  const handleNodeDoubleClick = useCallback((node: TopologyNode) => {
    networkWorkspaceStore.selectEntity({ type: node.entityType, id: node.sourceId });
    if (node.entityType === "external_endpoint") {
      uiStore.setActiveSidebarView("traffic");
    } else if (node.entityType === "interface") {
      uiStore.setActiveSidebarView("interfaces");
    } else {
      uiStore.setActiveSidebarView("systems");
    }
  }, []);

  return (
    <div
      role="region"
      aria-label="Interactive Network Topology"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
    >
      {/* Top Toolbar with Mode Switcher, Filters, and Zoom Controls */}
      <TopologyToolbar
        mode={mode}
        onModeChange={setMode}
        filters={filters}
        onFilterChange={setFilters}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        zoomLevel={zoom}
        nodeCount={projection.nodes.length}
        edgeCount={projection.edges.length}
        isolatedCount={projection.isolatedNodeCount}
        isStale={isStale || status === "degraded"}
        onResync={() => networkWorkspaceStore.resync()}
      />

      {/* Real Connections Notice Banner (if entities exist but no connections) */}
      {projection.nodes.length > 0 && projection.edges.length === 0 && (
        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "11px",
            color: "var(--color-text-muted)",
          }}
        >
          <NetworkIcon size={14} style={{ color: "var(--color-text-secondary)" }} />
          <span>
            No authoritative transport connections currently link these entities in {mode} mode. Nodes are legitimately displayed as isolated.
          </span>
        </div>
      )}

      {/* Interactive Topology Graph Canvas */}
      <TopologyCanvas
        nodes={projection.nodes}
        edges={projection.edges}
        mode={mode}
        selectedEntity={selectedEntity}
        onSelectEntity={handleSelectEntity}
        onNodeDoubleClick={handleNodeDoubleClick}
        zoom={zoom}
        pan={pan}
        onPanChange={setPan}
        width={1000}
        height={640}
      />
    </div>
  );
};
