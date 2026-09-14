/**
 * Fluffy Desktop - Interactive Network Topology Canvas (Phase N9)
 * 
 * Renders real nodes, devices, interfaces, and authoritative network connections
 * on a high-performance, accessible SVG graph canvas with zoom, pan, selection,
 * hover preview, and double-click navigation.
 * 
 * Invariants:
 * - Real connections ONLY (No invented edges).
 * - Distinguishes connection kinds (ClusterTransport, LocalSocketFlow, IpcStream, WebSocketBridge).
 * - Synchronizes with unified NetworkEntitySelection.
 * 
 * Zero Emojis, Zero N10+ functionality.
 */

import React, { useState, useRef, useCallback } from "react";
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<TopologyEdge | null>(null);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan on left click background
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "rect") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        onPanChange({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart, onPanChange]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Node position map for fast edge lookup
  const nodeMap = new Map<string, TopologyNode>(nodes.map((n) => [n.id, n]));

  // Edge styling based on connection kind & mode
  const getEdgeStyle = (edge: TopologyEdge) => {
    const isSelected = selectedEntity.type === "connection" && selectedEntity.id === edge.connectionId;
    const isHovered = hoveredEdge?.id === edge.id;

    let stroke = "var(--color-border-hover)";
    let strokeDasharray = "none";
    let strokeWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;

    if (edge.kind === "cluster_transport") {
      stroke = isSelected ? "var(--color-accent)" : "rgba(59, 130, 246, 0.85)"; // Blue / Cyan
      strokeWidth = isSelected ? 3.5 : 2;
    } else if (edge.kind === "local_socket_flow") {
      stroke = isSelected ? "var(--color-accent)" : "rgba(168, 85, 247, 0.75)"; // Purple
      strokeDasharray = "5, 4";
    } else if (edge.kind === "ipc_stream") {
      stroke = isSelected ? "var(--color-accent)" : "rgba(234, 179, 8, 0.75)"; // Amber
      strokeDasharray = "3, 3";
    } else if (edge.kind === "web_socket_bridge") {
      stroke = isSelected ? "var(--color-accent)" : "rgba(16, 185, 129, 0.75)"; // Emerald
      strokeDasharray = "8, 3, 2, 3";
    }

    if (mode === "traffic" && edge.trafficRateBps) {
      strokeWidth = Math.min(6, Math.max(2, Math.log10(edge.trafficRateBps / 1000 + 1) * 2));
    }

    return { stroke, strokeDasharray, strokeWidth };
  };

  // Node visual styling helper
  const getNodeBorder = (node: TopologyNode) => {
    const isSelected =
      (selectedEntity.type === "node" && selectedEntity.id === node.sourceId) ||
      (selectedEntity.type === "device" && selectedEntity.id === node.sourceId) ||
      (selectedEntity.type === "interface" && selectedEntity.id === node.sourceId);

    if (isSelected) {
      return "2px solid var(--color-accent)";
    }
    if (mode === "security" && (node.securityObservationCount ?? 0) > 0) {
      return "1.5px solid var(--color-warning)";
    }
    if (node.entityType === "external_endpoint") {
      return "1px dashed var(--color-border-hover)";
    }
    if (node.status === "available" || node.status === "reachable" || node.status === "up") {
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

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {/* Background SVG Grid & Connection Edges */}
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
          {/* Subtle Canvas Dot Grid Pattern */}
          <pattern id="topo-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.8" fill="var(--color-border)" opacity="0.6" />
          </pattern>
          {/* Arrow markers for connection directions */}
          <marker id="arrow-cluster" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(59, 130, 246, 0.85)" />
          </marker>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(168, 85, 247, 0.75)" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect width="100%" height="100%" fill="url(#topo-grid)" />

        {/* Scaled/Panned Graph Layer */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Real Authoritative Connections */}
          {edges.map((edge) => {
            const src = nodeMap.get(edge.sourceNodeId);
            const tgt = nodeMap.get(edge.targetNodeId);
            if (!src || !tgt) return null;

            const isSelected = selectedEntity.type === "connection" && selectedEntity.id === edge.connectionId;
            const style = getEdgeStyle(edge);
            const markerId = edge.kind === "cluster_transport" ? "url(#arrow-cluster)" : "url(#arrow-flow)";

            return (
              <g key={edge.id} style={{ cursor: "pointer" }}>
                {/* Thick invisible hit area for easy selection */}
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
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
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  markerEnd={edge.direction === "outbound" || edge.direction === "inbound" ? markerId : undefined}
                  style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
                />
                {/* Connection Kind Label (Centered along edge if selected or hovered) */}
                {(isSelected || hoveredEdge?.id === edge.id) && (
                  <g transform={`translate(${(src.x + tgt.x) / 2}, ${(src.y + tgt.y) / 2})`}>
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
            const isSelected =
              (selectedEntity.type === "node" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "device" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "interface" && selectedEntity.id === node.sourceId) ||
              (selectedEntity.type === "external_endpoint" && (selectedEntity.id === node.sourceId || selectedEntity.id === `external:${node.sourceId}`));

            const isHovered = hoveredNode?.id === node.id;
            const nodeWidth = 140;
            const nodeHeight = 58;
            const selType: NetworkEntitySelection["type"] = node.entityType;

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Topology Node: ${node.label} (${node.status})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity({ type: selType, id: node.sourceId });
                }}
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
                  left: `${node.x - nodeWidth / 2}px`,
                  top: `${node.y - nodeHeight / 2}px`,
                  width: `${nodeWidth}px`,
                  height: `${nodeHeight}px`,
                  backgroundColor: isSelected
                    ? "var(--color-surface-elevated)"
                    : isHovered
                    ? "var(--color-surface-hover)"
                    : "var(--color-surface)",
                  border: getNodeBorder(node),
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: isSelected ? "0 0 12px rgba(59, 130, 246, 0.35)" : "var(--shadow-sm)",
                  pointerEvents: "auto",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s, background-color 0.2s",
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
                  {/* Status Indicator Dot */}
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      backgroundColor:
                        node.status === "available" || node.status === "reachable" || node.status === "up" || node.status === "active"
                          ? "var(--color-success)"
                          : node.status === "busy"
                          ? "var(--color-warning)"
                          : node.status === "offline" || node.status === "unreachable" || node.status === "failed" || node.status === "down"
                          ? "var(--color-error)"
                          : "var(--color-text-muted)",
                      flexShrink: 0,
                    }}
                  />
                </div>

                {/* Node Subtitle & Badges */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-muted)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

      {/* Hover Detail Preview Card (Floating overlay) */}
      {hoveredNode && (
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
            zIndex: 10,
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
