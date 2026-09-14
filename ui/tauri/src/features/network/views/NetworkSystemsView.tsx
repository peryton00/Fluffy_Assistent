/**
 * Fluffy Desktop - Network Systems View (Phase N8)
 * 
 * Displays authoritative Fluffy cluster nodes and passively discovered network devices.
 * 
 * Invariants:
 * - Clear identity separation: Cluster Node vs Discovered Device.
 * - Discovered devices are unauthenticated network entities, not trusted cluster nodes.
 * - Read-only: Connect/pair workflows are strictly deferred to Phase N10.
 */

import React, { useState } from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import { CpuIcon, WifiIcon } from "../../../components/common/Icons";
import type { AdminBatchCommandResult } from "../../../types/contracts";

export const NetworkSystemsView: React.FC = () => {
  const nodes = useNetworkWorkspaceStore((s) => s.nodes);
  const devices = useNetworkWorkspaceStore((s) => s.devices);
  const status = useNetworkWorkspaceStore((s) => s.status);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);
  const connectingNodeIds = useNetworkWorkspaceStore((s) => s.connectingNodeIds);
  const executingNodeIds = useNetworkWorkspaceStore((s) => s.executingCommandNodeIds);

  const [selectedBatchNodeIds, setSelectedBatchNodeIds] = useState<Set<string>>(new Set());
  const [batchExecuting, setBatchExecuting] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<AdminBatchCommandResult | null>(null);

  const toggleSelectAllConnected = () => {
    const connectedNodeIds = nodes.filter((n) => n.availability === "connected").map((n) => n.id);
    if (selectedBatchNodeIds.size === connectedNodeIds.length && connectedNodeIds.length > 0) {
      setSelectedBatchNodeIds(new Set());
    } else {
      setSelectedBatchNodeIds(new Set(connectedNodeIds));
    }
  };

  const toggleNodeSelection = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const next = new Set(selectedBatchNodeIds);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    setSelectedBatchNodeIds(next);
  };

  const handleBatchScan = async () => {
    const targetIds = Array.from(selectedBatchNodeIds);
    if (targetIds.length === 0) return;
    setBatchExecuting(true);
    setBatchResult(null);
    try {
      const res = await networkWorkspaceStore.executeBatchCommand(
        targetIds,
        "System.GetHardware",
        {},
        true
      );
      setBatchResult(res);
    } catch (e: any) {
      console.error("Batch scan error:", e);
    } finally {
      setBatchExecuting(false);
    }
  };

  const handleBatchDisconnect = async () => {
    const targetIds = Array.from(selectedBatchNodeIds);
    if (targetIds.length === 0) return;
    setBatchExecuting(true);
    try {
      await Promise.all(targetIds.map((id) => networkWorkspaceStore.disconnectNode(id)));
      setSelectedBatchNodeIds(new Set());
    } finally {
      setBatchExecuting(false);
    }
  };

  const handleConnect = async (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    await networkWorkspaceStore.connectNode(nodeId);
  };

  const handleDisconnect = async (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    await networkWorkspaceStore.disconnectNode(nodeId);
  };

  const connectedNodes = nodes.filter((n) => n.availability === "connected");
  const isAllConnectedSelected =
    connectedNodes.length > 0 && selectedBatchNodeIds.size === connectedNodes.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* 1. Cluster Nodes Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <CpuIcon size={18} style={{ color: "var(--color-accent)" }} />
              <span>Fluffy Cluster Nodes ({nodes.length})</span>
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Authoritative Fluffy agent nodes participating in the distributed cluster.
            </p>
          </div>
        </div>

        {/* Batch Action Toolbar */}
        {selectedBatchNodeIds.size > 0 && (
          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ fontWeight: "bold" }}>
                {selectedBatchNodeIds.size} node(s) selected
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                onClick={handleBatchScan}
                disabled={batchExecuting}
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--color-text)",
                  cursor: batchExecuting ? "not-allowed" : "pointer",
                }}
              >
                {batchExecuting ? "Scanning..." : "Diagnostic Scan (Batch)"}
              </button>
              <button
                type="button"
                onClick={handleBatchDisconnect}
                disabled={batchExecuting}
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  color: "var(--color-danger)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-xs)",
                  cursor: batchExecuting ? "not-allowed" : "pointer",
                }}
              >
                Disconnect Selected
              </button>
            </div>
          </div>
        )}

        {/* Batch Execution Results Drawer */}
        {batchResult && (
          <div
            style={{
              padding: "var(--space-3)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)", fontWeight: "bold" }}>
              <span>Batch Execution Results ({batchResult.batch_id})</span>
              <span style={{ color: batchResult.failed_targets === 0 ? "var(--color-success)" : "var(--color-warning, #eab308)" }}>
                {batchResult.successful_targets}/{batchResult.total_targets} Succeeded ({batchResult.total_duration_ms}ms)
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {batchResult.results.map((r) => (
                <div
                  key={r.target_node_id}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "var(--color-surface-elevated)",
                    borderRadius: "var(--radius-xs)",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span>{r.target_node_id}</span>
                  <span style={{ color: r.success ? "var(--color-success)" : "var(--color-danger)" }}>
                    {r.success ? "Success" : r.error?.message || "Failed"} ({r.execution_duration_ms}ms)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {nodes.length > 0 ? (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-xs)" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)", width: "30px" }}>
                    <input
                      type="checkbox"
                      checked={isAllConnectedSelected}
                      onChange={toggleSelectAllConnected}
                      title="Select all connected nodes"
                    />
                  </th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Node ID</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Node Name</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Platform / Arch</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Role</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Availability</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Auth State</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Pairing State</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Trust / Transport</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const isSelected = selectedEntity.type === "node" && selectedEntity.id === n.id;
                  const isConnecting = connectingNodeIds.has(n.id);
                  const isExecuting = executingNodeIds.has(n.id);
                  const isConnected = n.availability === "connected";
                  const isPairingOrAuth = n.availability === "pairing" || n.availability === "authenticating";
                  const canConnect = n.availability === "available" || n.availability === "disconnected";
                  const isBatchChecked = selectedBatchNodeIds.has(n.id);

                  return (
                    <tr
                      key={n.id}
                      onClick={() => networkWorkspaceStore.selectEntity("node", n.id)}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "var(--space-2) var(--space-3)" }} onClick={(e) => e.stopPropagation()}>
                        {isConnected && (
                          <input
                            type="checkbox"
                            checked={isBatchChecked}
                            onChange={(e) => toggleNodeSelection(e as any, n.id)}
                          />
                        )}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>{n.id}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: "var(--font-weight-semibold)" }}>{n.name}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)" }}>
                        {n.os} ({n.arch})
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: "var(--color-surface-elevated)",
                            fontSize: "11px",
                          }}
                        >
                          {n.role}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor:
                              n.availability === "connected"
                                ? "rgba(34, 197, 94, 0.2)"
                                : n.availability === "available"
                                ? "rgba(59, 130, 246, 0.2)"
                                : isPairingOrAuth
                                ? "rgba(234, 179, 8, 0.2)"
                                : "rgba(239, 68, 68, 0.2)",
                            color:
                              n.availability === "connected"
                                ? "var(--color-success)"
                                : n.availability === "available"
                                ? "var(--color-info, #3b82f6)"
                                : isPairingOrAuth
                                ? "var(--color-warning, #eab308)"
                                : "var(--color-danger)",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                        >
                          {n.availability.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-muted)" }}>
                        {n.auth_state}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-muted)" }}>
                        {n.pairing_state}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: "var(--color-surface-elevated)",
                            fontSize: "10px",
                            color: "var(--color-text-secondary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {isConnected ? "legacy_compat" : "unlinked"}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
                        {isConnected ? (
                          <button
                            onClick={(e) => handleDisconnect(e, n.id)}
                            disabled={isConnecting || isExecuting}
                            style={{
                              padding: "3px 10px",
                              fontSize: "11px",
                              fontWeight: "var(--font-weight-semibold)",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "var(--color-danger)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: "var(--radius-xs)",
                              cursor: isConnecting || isExecuting ? "not-allowed" : "pointer",
                              opacity: isConnecting || isExecuting ? 0.6 : 1,
                            }}
                          >
                            {isConnecting ? "Disconnecting..." : isExecuting ? "Executing..." : "Disconnect"}
                          </button>
                        ) : isPairingOrAuth ? (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--color-warning, #eab308)",
                              fontStyle: "italic",
                            }}
                          >
                            In Progress...
                          </span>
                        ) : canConnect ? (
                          <button
                            onClick={(e) => handleConnect(e, n.id)}
                            disabled={isConnecting}
                            style={{
                              padding: "3px 10px",
                              fontSize: "11px",
                              fontWeight: "var(--font-weight-semibold)",
                              backgroundColor: "rgba(59, 130, 246, 0.15)",
                              color: "var(--color-info, #3b82f6)",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              borderRadius: "var(--radius-xs)",
                              cursor: isConnecting ? "not-allowed" : "pointer",
                              opacity: isConnecting ? 0.6 : 1,
                            }}
                          >
                            {isConnecting ? "Connecting..." : "Connect"}
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-6)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {status === "loading"
              ? "Loading cluster nodes..."
              : "No cluster nodes registered in authoritative state."}
          </div>
        )}
      </div>

      {/* 2. Discovered Network Devices Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <WifiIcon size={18} style={{ color: "var(--color-accent)" }} />
              <span>Discovered Network Devices ({devices.length})</span>
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Local subnet neighbors passively discovered via OS ARP and neighbor cache. (Unauthenticated endpoints; not cluster nodes).
            </p>
          </div>
        </div>

        {devices.length > 0 ? (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-xs)" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Device ID</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>IP Address</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>MAC Address</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Hostname</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Category</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>Discovery Source</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)" }}>State</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const isSelected = selectedEntity.type === "device" && selectedEntity.id === d.id;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => networkWorkspaceStore.selectEntity("device", d.id)}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)" }}>{d.id}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: "var(--font-weight-semibold)" }}>{d.ip_address}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {d.mac_address || "Unavailable"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)" }}>
                        {d.hostname || "Unresolved"}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: "var(--color-surface-elevated)",
                            fontSize: "11px",
                          }}
                        >
                          {d.category}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-muted)" }}>
                        {d.source}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor:
                              d.state === "reachable"
                                ? "rgba(34, 197, 94, 0.2)"
                                : "rgba(107, 114, 128, 0.2)",
                            color:
                              d.state === "reachable"
                                ? "var(--color-success)"
                                : "var(--color-text-secondary)",
                            fontSize: "11px",
                          }}
                        >
                          {d.state.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-6)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {status === "loading"
              ? "Scanning subnet devices..."
              : "No subnet devices observed in current ARP cache."}
          </div>
        )}
      </div>
    </div>
  );
};
