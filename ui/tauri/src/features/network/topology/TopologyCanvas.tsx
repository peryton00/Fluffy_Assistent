/**
 * Fluffy Desktop - Interactive Network Topology Canvas (Phase N9)
 * 
 * Renders real nodes, devices, interfaces, and authoritative network connections
 * on a high-performance, accessible SVG graph canvas with independent node dragging,
 * dynamic edge tracking, wheel zoom, pan, selection, hover preview, and double-click navigation.
 * 
 * Invariants:
 * - Real connections ONLY (No invented edges).
 * - Distinguishes connection kinds (ClusterTransport, LocalSocketFlow, IpcStream, WebSocketBridge).
 * - Synchronizes with unified NetworkEntitySelection.
 * - Zero Emojis, Zero N10+ functionality.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { TopologyNode, TopologyEdge, TopologyMode } from "./topologyModel";
import type { NetworkEntitySelection } from "../../../types/contracts";
import {
  CpuIcon,
  WifiIcon,
  DatabaseIcon,
  ShieldIcon,
  ActivityIcon,
  NetworkIcon,
  GlobeIcon,
  RefreshCwIcon,
} from "../../../components/common/Icons";

interface TopologyCanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  mode: TopologyMode;
  selectedEntity: NetworkEntitySelection;
  onSelectEntity: (selection: NetworkEntitySelection) => void;
  onNodeDoubleClick?: (node: TopologyNode) => void;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  width?: number;
  height?: number;
}

interface DragNodeState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startNodeX: number;
  startNodeY: number;
  hasMoved: boolean;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  nodes,
  edges,
  mode,
  selectedEntity,
  onSelectEntity,
  onNodeDoubleClick,
  zoom,
  pan,
  onPanChange,
  height = 640,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Canvas Pan State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Independent Node Drag State & Custom Position Overrides
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragNode, setDragNode] = useState<DragNodeState | null>(null);

  // Hover States
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<TopologyEdge | null>(null);

  // Compute live effective node position (custom override or deterministic layout position)
  const getNodePos = useCallback(
    (node: TopologyNode): { x: number; y: number } => {
      if (customPositions[node.id]) {
        return customPositions[node.id];
      }
      return { x: node.x, y: node.y };
    },
    [customPositions]
  );

  // Quick lookup map of nodes with effective coordinates
  const nodePositionMap = useMemo(() => {
    const map = new Map<string, { node: TopologyNode; x: number; y: number }>();
    for (const node of nodes) {
      const pos = getNodePos(node);
      map.set(node.id, { node, x: pos.x, y: pos.y });
    }
    return map;
  }, [nodes, getNodePos]);

  // Identify active selected or hovered node for connection highlighting
  const activeFocusNodeId = useMemo(() => {
    if (hoveredNode) return hoveredNode.id;
    if (selectedEntity.id) {
      const match = nodes.find(
        (n) =>
          n.sourceId === selectedEntity.id ||
          n.id === selectedEntity.id ||
          `node:${selectedEntity.id}` === n.id ||
          `device:${selectedEntity.id}` === n.id ||
          `interface:${selectedEntity.id}` === n.id ||
          `external:${selectedEntity.id}` === n.id
      );
      if (match) return match.id;
    }
    return null;
  }, [hoveredNode, selectedEntity, nodes]);

  // Set of connected edges and nodes for focused highlighting
  const { connectedEdgeIds, connectedNodeIds } = useMemo(() => {
    const edgeSet = new Set<string>();
    const nodeSet = new Set<string>();

    if (activeFocusNodeId) {
      nodeSet.add(activeFocusNodeId);
      for (const edge of edges) {
        if (edge.sourceNodeId === activeFocusNodeId) {
          edgeSet.add(edge.id);
          nodeSet.add(edge.targetNodeId);
        } else if (edge.targetNodeId === activeFocusNodeId) {
          edgeSet.add(edge.id);
          nodeSet.add(edge.sourceNodeId);
        }
      }
    }
    return { connectedEdgeIds: edgeSet, connectedNodeIds: nodeSet };
  }, [activeFocusNodeId, edges]);

  // Canvas background Pan handlers
  const handleMouseDownBackground = (e: React.MouseEvent) => {
    // Only pan if left click directly on background svg/rect/container
    if (
      e.target === containerRef.current ||
      (e.target as HTMLElement).tagName === "svg" ||
      (e.target as HTMLElement).tagName === "rect"
    ) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Node Drag Initiator
  const handleNodeMouseDown = (e: React.MouseEvent, node: TopologyNode) => {
    if (e.button !== 0) return; // Only left-click drag
    e.stopPropagation();

    const currentPos = getNodePos(node);
    setDragNode({
      id: node.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: currentPos.x,
      startNodeY: currentPos.y,
      hasMoved: false,
    });
  };

  // Global mouse move & mouse up listeners during drag/pan
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (dragNode) {
        const deltaX = (e.clientX - dragNode.startMouseX) / zoom;
        const deltaY = (e.clientY - dragNode.startMouseY) / zoom;
        const distance = Math.hypot(e.clientX - dragNode.startMouseX, e.clientY - dragNode.startMouseY);

        setDragNode((prev) => (prev ? { ...prev, hasMoved: prev.hasMoved || distance > 3 } : null));

        setCustomPositions((prev) => ({
          ...prev,
          [dragNode.id]: {
            x: Math.round(dragNode.startNodeX + deltaX),
            y: Math.round(dragNode.startNodeY + deltaY),
          },
        }));
      } else if (isPanning) {
        onPanChange({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    };

    const handleWindowMouseUp = () => {
      if (dragNode) {
        if (!dragNode.hasMoved) {
          const targetNode = nodes.find((n) => n.id === dragNode.id);
          if (targetNode) {
            onSelectEntity({ type: targetNode.entityType, id: targetNode.sourceId });
          }
        }
        setDragNode(null);
      }
      if (isPanning) {
        setIsPanning(false);
      }
    };

    if (dragNode || isPanning) {
      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleWindowMouseUp);
      };
    }
  }, [dragNode, isPanning, zoom, panStart, onPanChange, nodes, onSelectEntity]);

  // Smooth mouse wheel zoom centered around cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const zoomStep = -e.deltaY * 0.0012;
    const nextZoom = Math.min(2.5, Math.max(0.35, Math.round((zoom + zoomStep) * 100) / 100));

    if (nextZoom === zoom) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = nextZoom / zoom;
    const nextPanX = cursorX - (cursorX - pan.x) * zoomFactor;
    const nextPanY = cursorY - (cursorY - pan.y) * zoomFactor;

    onPanChange({
      x: Math.round(nextPanX),
      y: Math.round(nextPanY),
    });
  };

  // Reset node positions to deterministic organized layout
  const handleResetLayout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomPositions({});
  };

  // Edge styling based on connection kind & mode
  const getEdgeStyle = (edge: TopologyEdge) => {
    const isSelected = selectedEntity.type === "connection" && selectedEntity.id === edge.connectionId;
    const isHovered = hoveredEdge?.id === edge.id;
    const isConnectedToFocus = connectedEdgeIds.has(edge.id);

    let stroke = "var(--color-border-hover)";
    let strokeDasharray = "none";
    let strokeWidth = isSelected ? 3 : isHovered ? 2.5 : isConnectedToFocus ? 2.2 : 1.5;

    if (edge.kind === "cluster_transport") {
      stroke = isSelected || isConnectedToFocus ? "var(--color-accent)" : "rgba(59, 130, 246, 0.85)"; // Blue / Cyan
      strokeWidth = isSelected ? 3.5 : 2;
    } else if (edge.kind === "local_socket_flow") {
      stroke = isSelected || isConnectedToFocus ? "var(--color-accent)" : "rgba(168, 85, 247, 0.75)"; // Purple
      strokeDasharray = "5, 4";
    } else if (edge.kind === "ipc_stream") {
      stroke = isSelected || isConnectedToFocus ? "var(--color-accent)" : "rgba(234, 179, 8, 0.75)"; // Amber
      strokeDasharray = "3, 3";
    } else if (edge.kind === "web_socket_bridge") {
      stroke = isSelected || isConnectedToFocus ? "var(--color-accent)" : "rgba(16, 185, 129, 0.75)"; // Emerald
      strokeDasharray = "8, 3, 2, 3";
    }

    if (mode === "traffic" && edge.trafficRateBps) {
      strokeWidth = Math.min(6, Math.max(2, Math.log10(edge.trafficRateBps / 1000 + 1) * 2));
    }

    return { stroke, strokeDasharray, strokeWidth };
  };

  // Node visual styling helper
  const getNodeBorder = (node: TopologyNode, isSelected: boolean) => {
    if (isSelected) {
      return "2px solid var(--color-accent)";
    }
    if (mode === "security" && (node.securityObservationCount ?? 0) > 0) {
      return "1.5px solid var(--color-warning)";
    }
    if (node.entityType === "external_endpoint") {
      return "1px dashed var(--color-border-hover)";
    }
    if (node.status === "available" || node.status === "reachable" || node.status === "up" || node.status === "active") {
      return "1px solid rgba(16, 185, 129, 0.4)";
    }
    if (node.status === "busy") {
      return "1px solid rgba(234, 179, 8, 0.4)";
    }
    if (node.status === "offline" || node.status === "unreachable" || node.status === "down" || node.status === "failed") {
      return "1px solid rgba(239, 68, 68, 0.3)";
    }
    return "1px solid var(--color-border)";
  };

  const getNodeIcon = (node: TopologyNode) => {
    if (node.entityType === "node") {
      return <CpuIcon size={16} style={{ color: "var(--color-accent)" }} />;
    }
    if (node.entityType === "device") {
      return <WifiIcon size={16} style={{ color: "rgba(59, 130, 246, 0.9)" }} />;
    }
    if (node.entityType === "external_endpoint") {
      return <GlobeIcon size={16} style={{ color: "rgba(148, 163, 184, 0.9)" }} />;
    }
    return <DatabaseIcon size={16} style={{ color: "rgba(168, 85, 247, 0.9)" }} />;
  };

  const hasCustomPositions = Object.keys(customPositions).length > 0;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownBackground}
      onWheel={handleWheel}
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        cursor: dragNode ? "grabbing" : isPanning ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {/* Background SVG Grid & Dynamic Connection Edges */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
        }}
      >
        <defs>
          {/* Dynamic Minor Dot Grid synchronized with Pan and Zoom */}
          <pattern
            id="topo-grid-minor"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          >
            <circle cx="12" cy="12" r="0.75" fill="var(--color-border)" opacity="0.5" />
          </pattern>

          {/* Dynamic Major Crosshair Grid (every 120px) synchronized with Pan and Zoom */}
          <pattern
            id="topo-grid-major"
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          >
            <path
              d="M 60 55 L 60 65 M 55 60 L 65 60"
              stroke="var(--color-border-hover)"
              strokeWidth="0.85"
              opacity="0.6"
            />
          </pattern>

          {/* Ambient Depth Vignette */}
          <radialGradient id="topo-ambient-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="var(--color-surface)" stopOpacity="0.15" />
            <stop offset="70%" stopColor="var(--color-bg)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--color-bg)" stopOpacity="0.85" />
          </radialGradient>

          {/* Arrow markers for connection directions */}
          <marker id="arrow-cluster" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(59, 130, 246, 0.85)" />
          </marker>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(168, 85, 247, 0.75)" />
          </marker>
        </defs>

        {/* Ambient Depth Vignette */}
        <rect width="100%" height="100%" fill="url(#topo-ambient-vignette)" />

        {/* Dynamic Minor Dot Matrix */}
        <rect width="100%" height="100%" fill="url(#topo-grid-minor)" />

        {/* Dynamic Major Crosshairs */}
        <rect width="100%" height="100%" fill="url(#topo-grid-major)" />

        {/* Scaled/Panned Graph Layer */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Graph Origin Target Marker */}
          <g opacity="0.35" pointerEvents="none">
            <circle cx="0" cy="0" r="2.5" fill="var(--color-accent)" opacity="0.7" />
            <circle cx="0" cy="0" r="7" fill="none" stroke="var(--color-border-hover)" strokeWidth="0.75" strokeDasharray="2,2" />
          </g>

          {/* Real Authoritative Connections */}
          {edges.map((edge) => {
            const srcEntry = nodePositionMap.get(edge.sourceNodeId);
            const tgtEntry = nodePositionMap.get(edge.targetNodeId);
            if (!srcEntry || !tgtEntry) return null;

            const isSelected = selectedEntity.type === "connection" && selectedEntity.id === edge.connectionId;
            const style = getEdgeStyle(edge);
            const markerId = edge.kind === "cluster_transport" ? "url(#arrow-cluster)" : "url(#arrow-flow)";

            return (
              <g key={edge.id} style={{ cursor: "pointer" }}>
                {/* Invisible hit area for effortless selection */}
                <line
                  x1={srcEntry.x}
                  y1={srcEntry.y}
                  x2={tgtEntry.x}
                  y2={tgtEntry.y}
                  stroke="transparent"
                  strokeWidth="14"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity({ type: "connection", id: edge.connectionId });
                  }}
                  onMouseEnter={() => setHoveredEdge(edge)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                {/* Visible Edge Line */}
                <line
                  x1={srcEntry.x}
                  y1={srcEntry.y}
                  x2={tgtEntry.x}
                  y2={tgtEntry.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  markerEnd={edge.direction === "outbound" || edge.direction === "inbound" ? markerId : undefined}
                  style={{ transition: dragNode ? "none" : "stroke 0.2s, stroke-width 0.2s" }}
                />
                {/* Connection Kind Label (Centered along edge if selected or hovered) */}
                {(isSelected || hoveredEdge?.id === edge.id) && (
                  <g transform={`translate(${(srcEntry.x + tgtEntry.x) / 2}, ${(srcEntry.y + tgtEntry.y) / 2})`}>
                    <rect
                      x="-45"
                      y="-11"
                      width="90"
                      height="20"
                      rx="3"
                      fill="var(--color-surface)"
                      stroke="var(--color-border)"
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill="var(--color-text-primary)"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                    >
                      {edge.kind === "cluster_transport" ? "CLUSTER" : edge.protocol.toUpperCase()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* HTML Node Layer (Transformed with Canvas Pan & Zoom) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          transformOrigin: "0 0",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
          }}
        >
          {nodes.map((node) => {
            const pos = getNodePos(node);
            const isSelected =
              (selectedEntity.type === "node" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "device" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "interface" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "external_endpoint" &&
                (selectedEntity.id === node.sourceId || selectedEntity.id === `external:${node.sourceId}`));

            const isHovered = hoveredNode?.id === node.id;
            const isDraggingThisNode = dragNode?.id === node.id;
            const isConnectedToFocus = activeFocusNodeId ? connectedNodeIds.has(node.id) : true;

            const nodeWidth = 140;
            const nodeHeight = 58;
            const selType: NetworkEntitySelection["type"] = node.entityType;

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Topology Node: ${node.label} (${node.status})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity({ type: selType, id: node.sourceId });
                  if (onNodeDoubleClick) {
                    onNodeDoubleClick(node);
                  }
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  position: "absolute",
                  left: `${pos.x - nodeWidth / 2}px`,
                  top: `${pos.y - nodeHeight / 2}px`,
                  width: `${nodeWidth}px`,
                  height: `${nodeHeight}px`,
                  backgroundColor: isSelected
                    ? "var(--color-surface-elevated)"
                    : isHovered
                    ? "var(--color-surface-hover)"
                    : "var(--color-surface)",
                  border: getNodeBorder(node, isSelected),
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: isSelected
                    ? "0 0 14px rgba(59, 130, 246, 0.4)"
                    : isDraggingThisNode
                    ? "0 8px 20px rgba(0, 0, 0, 0.45)"
                    : isHovered
                    ? "var(--shadow-md)"
                    : "var(--shadow-sm)",
                  opacity: activeFocusNodeId && !isConnectedToFocus ? 0.65 : 1,
                  pointerEvents: "auto",
                  cursor: isDraggingThisNode ? "grabbing" : "grab",
                  zIndex: isDraggingThisNode ? 20 : isSelected ? 15 : isHovered ? 10 : 1,
                  transition: isDraggingThisNode ? "none" : "box-shadow 0.2s, background-color 0.2s, opacity 0.2s",
                }}
              >
                {/* Node Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                    {getNodeIcon(node)}
                    <span
                      style={{
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {node.label}
                    </span>
                  </div>
                  {/* Status Dot */}
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      backgroundColor:
                        node.status === "available" ||
                        node.status === "reachable" ||
                        node.status === "up" ||
                        node.status === "active"
                          ? "var(--color-success)"
                          : node.status === "busy"
                          ? "var(--color-warning)"
                          : node.status === "offline" ||
                            node.status === "unreachable" ||
                            node.status === "failed" ||
                            node.status === "down"
                          ? "var(--color-error)"
                          : "var(--color-text-muted)",
                      flexShrink: 0,
                    }}
                  />
                </div>

                {/* Node Subtitle & Badges */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {node.ip || node.sublabel}
                  </span>
                  {node.connectionCount > 0 && (
                    <span
                      style={{
                        backgroundColor: "var(--color-surface-elevated)",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        fontSize: "9px",
                        fontWeight: "bold",
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {node.connectionCount}
                    </span>
                  )}
                </div>

                {/* Mode-Specific Indicators (Security / Traffic) */}
                {mode === "security" && (node.securityObservationCount ?? 0) > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      backgroundColor: "var(--color-warning)",
                      color: "#000",
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "1px 5px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    <ShieldIcon size={9} />
                    <span>{node.securityObservationCount}</span>
                  </div>
                )}
                {mode === "traffic" && (node.trafficRateBps ?? 0) > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      backgroundColor: "var(--color-accent)",
                      color: "#fff",
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "1px 5px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    <ActivityIcon size={9} />
                    <span>{Math.round((node.trafficRateBps || 0) / 1024)} KB/s</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Canvas Overlay Controls (Top Right) */}
      <div
        style={{
          position: "absolute",
          top: "var(--space-3)",
          right: "var(--space-3)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          zIndex: 25,
          pointerEvents: "auto",
        }}
      >
        {hasCustomPositions && (
          <button
            type="button"
            onClick={handleResetLayout}
            title="Reset node positions to auto-organized layout"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text-primary)",
              fontSize: "11px",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <RefreshCwIcon size={12} />
            <span>Auto Arrange</span>
          </button>
        )}
      </div>

      {/* Hover Detail Preview Card (Floating overlay) */}
      {hoveredNode && !dragNode && (
        <div
          style={{
            position: "absolute",
            bottom: "var(--space-3)",
            left: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3)",
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
            zIndex: 30,
            minWidth: "220px",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}>
            {getNodeIcon(hoveredNode)}
            <strong style={{ color: "var(--color-text-primary)" }}>{hoveredNode.label}</strong>
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div>ID: <span style={{ fontFamily: "var(--font-mono)" }}>{hoveredNode.sourceId}</span></div>
            {hoveredNode.ip && <div>IP: <span style={{ fontFamily: "var(--font-mono)" }}>{hoveredNode.ip}</span></div>}
            {hoveredNode.mac && <div>MAC: <span style={{ fontFamily: "var(--font-mono)" }}>{hoveredNode.mac}</span></div>}
            <div>Status: <span style={{ textTransform: "capitalize", color: "var(--color-text-primary)" }}>{hoveredNode.status}</span></div>
            <div>Connections: <strong style={{ color: "var(--color-text-primary)" }}>{hoveredNode.connectionCount}</strong></div>
            {hoveredNode.trafficRateBps !== undefined && hoveredNode.trafficRateBps > 0 && (
              <div>Traffic Rate: <strong style={{ color: "var(--color-accent)" }}>{Math.round(hoveredNode.trafficRateBps / 1024)} KB/s</strong></div>
            )}
          </div>
          <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--color-text-secondary)" }}>
            Tip: Drag to reposition node independently.
          </div>
        </div>
      )}

      {/* Empty State Banner if no nodes match */}
      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            color: "var(--color-text-muted)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <NetworkIcon size={32} style={{ color: "var(--color-border-hover)" }} />
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)" }}>
            No Topology Entities Observed
          </div>
          <div style={{ fontSize: "11px" }}>
            No cluster nodes or discovered devices match the current mode and filter criteria.
          </div>
        </div>
      )}
    </div>
  );
};
