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

import React, { useState, useEffect } from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import { useNetworkStore, networkStore } from "../../../stores/networkStore";
import {
  CpuIcon,
  WifiIcon,
  ServerIcon,
  RadioIcon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
  RefreshCwIcon,
} from "../../../components/common/Icons";
import type { AdminBatchCommandResult, NetworkRole } from "../../../types/contracts";

export const NetworkSystemsView: React.FC = () => {
  const nodes = useNetworkWorkspaceStore((s) => s.nodes);
  const devices = useNetworkWorkspaceStore((s) => s.devices);
  const interfaces = useNetworkWorkspaceStore((s) => s.interfaces);
  const status = useNetworkWorkspaceStore((s) => s.status);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);
  const connectingNodeIds = useNetworkWorkspaceStore((s) => s.connectingNodeIds);
  const executingNodeIds = useNetworkWorkspaceStore((s) => s.executingCommandNodeIds);

  const role = useNetworkStore((s) => s.role);
  const connectedAdmins = useNetworkStore((s) => s.connectedAdmins);
  const networkStoreLoading = useNetworkStore((s) => s.loading);
  const machines = useNetworkStore((s) => s.machines);
  const activeMachineId = useNetworkStore((s) => s.activeMachineId);
  const activeMachineData = useNetworkStore((s) => s.activeMachineData);

  const [adminCommandInput, setAdminCommandInput] = useState<string>("");
  const [adminCommandOutput, setAdminCommandOutput] = useState<{
    text: string;
    isError?: boolean;
    timestamp: string;
  } | null>(null);
  const [isAdminExecuting, setIsAdminExecuting] = useState<boolean>(false);

  const [selectedBatchNodeIds, setSelectedBatchNodeIds] = useState<Set<string>>(new Set());
  const [batchExecuting, setBatchExecuting] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<AdminBatchCommandResult | null>(null);

  // Add Node Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [nodeIp, setNodeIp] = useState<string>("");
  const [nodePort, setNodePort] = useState<string>("9010");
  const [nodeName, setNodeName] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Keep network discovery polled and synced while on Systems view
  useEffect(() => {
    networkStore.startPolling();
    return () => {
      networkStore.stopPolling();
    };
  }, []);

  const selectedTargetMachine =
    machines.find((m) => m.machine_id === activeMachineId) ||
    machines[0] ||
    null;

  const handleAdminSendCommand = async (e: React.FormEvent, machineId: string) => {
    e.preventDefault();
    if (!adminCommandInput.trim() || isAdminExecuting) return;
    const cmd = adminCommandInput.trim();
    setIsAdminExecuting(true);
    setAdminCommandOutput(null);
    try {
      const res = await networkStore.sendAction(machineId, cmd);
      setAdminCommandOutput({
        text: res.result || JSON.stringify(res, null, 2),
        isError: !res.ok,
        timestamp: new Date().toLocaleTimeString(),
      });
      await networkStore.refreshNow();
    } catch (err: unknown) {
      setAdminCommandOutput({
        text: err instanceof Error ? err.message : "Command execution failed.",
        isError: true,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsAdminExecuting(false);
    }
  };

  const handleAdminPing = async (machineId: string) => {
    setIsAdminExecuting(true);
    try {
      const res = await networkStore.sendAction(machineId, "ping");
      setAdminCommandOutput({
        text: res.result || "Ping completed.",
        isError: !res.ok,
        timestamp: new Date().toLocaleTimeString(),
      });
      await networkStore.refreshNow();
    } catch (err: unknown) {
      setAdminCommandOutput({
        text: err instanceof Error ? err.message : "Ping failed.",
        isError: true,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsAdminExecuting(false);
    }
  };

  const handleAdminScan = async (machineId: string) => {
    setIsAdminExecuting(true);
    try {
      const res = await networkStore.sendAction(machineId, "diagnostic_scan");
      setAdminCommandOutput({
        text: res.result || "Diagnostic scan completed.",
        isError: !res.ok,
        timestamp: new Date().toLocaleTimeString(),
      });
      await networkStore.refreshNow();
      await networkWorkspaceStore.resync();
    } catch (err: unknown) {
      setAdminCommandOutput({
        text: err instanceof Error ? err.message : "Diagnostic scan failed.",
        isError: true,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsAdminExecuting(false);
    }
  };

  const handleRoleChange = async (newRole: NetworkRole) => {
    if (newRole === role) return;
    await networkStore.changeRole(newRole);
    await networkWorkspaceStore.resync();
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIp.trim()) {
      setFormError("IP address or hostname is required.");
      return;
    }

    let cleanIp = nodeIp.trim();
    if (cleanIp.includes("://")) {
      cleanIp = cleanIp.split("://")[1];
    }
    if (cleanIp.includes("/")) {
      cleanIp = cleanIp.split("/")[0];
    }
    let portNum = parseInt(nodePort, 10);
    if (cleanIp.includes(":")) {
      const parts = cleanIp.split(":");
      cleanIp = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort)) {
        portNum = parsedPort;
      }
    }

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError("Port must be a valid number between 1 and 65535.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await networkStore.addNode(cleanIp, portNum, nodeName.trim() || undefined);
      await networkWorkspaceStore.resync();
      setIsAddModalOpen(false);
      setNodeIp("");
      setNodeName("");
      setNodePort("9010");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add network node.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickConnectDevice = (ip: string, name?: string) => {
    const clean = ip.replace(/\/\d+$/, "").trim();
    setNodeIp(clean);
    setNodePort("9010");
    setNodeName(name || "");
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldKey ? null : prev));
    }, 2000);
  };

  // Find active LAN IP address from interfaces (strip subnet mask / CIDR prefix)
  const activeInterface = interfaces.find(
    (i) => i.is_up && !i.is_loopback && i.ipv4_addresses.length > 0
  ) || interfaces.find((i) => i.ipv4_addresses.length > 0);
  const rawIp = activeInterface?.ipv4_addresses[0] || "127.0.0.1";
  const detectedIp = rawIp.replace(/\/\d+$/, "").trim();
  const broadcastUri = `fluffy://${detectedIp}:9010`;

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
    if (e) e.stopPropagation();
    await networkWorkspaceStore.disconnectNode(nodeId);
    await networkStore.removeNode(nodeId);
    await networkWorkspaceStore.resync();
  };

  const connectedNodes = nodes.filter((n) => n.availability === "connected");
  const isAllConnectedSelected =
    connectedNodes.length > 0 && selectedBatchNodeIds.size === connectedNodes.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* 0. Local Node Role & Mesh Identity Control */}
      <div
        style={{
          padding: "var(--space-4)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-accent)",
              }}
            >
              <ServerIcon size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)" }}>
                  Local Node Role
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    backgroundColor:
                      role === "available"
                        ? "rgba(34, 197, 94, 0.15)"
                        : role === "admin"
                        ? "rgba(59, 130, 246, 0.15)"
                        : "var(--color-surface-elevated)",
                    color:
                      role === "available"
                        ? "var(--color-success)"
                        : role === "admin"
                        ? "var(--color-accent)"
                        : "var(--color-text-muted)",
                    border: `1px solid ${
                      role === "available"
                        ? "rgba(34, 197, 94, 0.3)"
                        : role === "admin"
                        ? "rgba(59, 130, 246, 0.3)"
                        : "var(--color-border)"
                    }`,
                  }}
                >
                  {role}
                </span>
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, marginTop: "2px" }}>
                {role === "available"
                  ? "Broadcasting availability on local LAN. Admin instances can connect to this machine."
                  : role === "admin"
                  ? "Cluster controller mode. Discovering, connecting, and managing distributed cluster nodes."
                  : "Isolated standalone mode. Not broadcasting availability or controlling remote nodes."}
              </p>
            </div>
          </div>

          {/* Role Switcher Pills & Admin Action */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <div
              style={{
                display: "flex",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "2px",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              {(["standalone", "available", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRoleChange(r)}
                  disabled={networkStoreLoading}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    border: "none",
                    borderRadius: "var(--radius-xs)",
                    backgroundColor: role === r ? "var(--color-surface-elevated)" : "transparent",
                    color: role === r ? "var(--color-accent)" : "var(--color-text-muted)",
                    cursor: networkStoreLoading ? "wait" : "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            {role === "admin" && (
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setIsAddModalOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "5px 12px",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-medium)",
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-background)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                <PlusIcon size={13} />
                <span>Add Node Manually</span>
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                await networkStore.refreshNow();
                await networkWorkspaceStore.resync();
              }}
              disabled={networkStoreLoading}
              title="Refresh LAN Nodes & Authoritative State"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                padding: "5px 10px",
                fontSize: "11px",
                backgroundColor: "var(--color-surface-elevated)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: networkStoreLoading ? "wait" : "pointer",
              }}
            >
              <RefreshCwIcon size={12} />
            </button>
          </div>
        </div>

        {/* Detailed Available Machine Connection Card */}
        {role === "available" && (
          <div
            style={{
              padding: "var(--space-4)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <RadioIcon size={16} style={{ color: "var(--color-success)" }} />
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-success)" }}>
                Machine Availability Details (Share with Admin)
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--space-3)",
                fontSize: "12px",
              }}
            >
              <div style={{ backgroundColor: "var(--color-surface)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Local LAN IPv4:</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                  <strong style={{ fontFamily: "var(--font-mono)" }}>{detectedIp}</strong>
                  <button
                    type="button"
                    onClick={() => handleCopy(detectedIp, "ip")}
                    style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: "2px" }}
                    title="Copy IP"
                  >
                    {copiedField === "ip" ? <CheckIcon size={14} style={{ color: "var(--color-success)" }} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ backgroundColor: "var(--color-surface)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Discovery / RPC Port:</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                  <strong style={{ fontFamily: "var(--font-mono)" }}>9010</strong>
                  <button
                    type="button"
                    onClick={() => handleCopy("9010", "port")}
                    style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: "2px" }}
                    title="Copy Port"
                  >
                    {copiedField === "port" ? <CheckIcon size={14} style={{ color: "var(--color-success)" }} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ backgroundColor: "var(--color-surface)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Connection URI:</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {broadcastUri}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(broadcastUri, "uri")}
                    style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: "2px", flexShrink: 0 }}
                    title="Copy Connection URI"
                  >
                    {copiedField === "uri" ? <CheckIcon size={14} style={{ color: "var(--color-success)" }} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Connected Admins status */}
            <div
              style={{
                padding: "var(--space-2) var(--space-3)",
                backgroundColor: connectedAdmins.length > 0 ? "rgba(34, 197, 94, 0.1)" : "var(--color-surface)",
                border: `1px ${connectedAdmins.length > 0 ? "solid rgba(34, 197, 94, 0.3)" : "dashed var(--color-border)"}`,
                borderRadius: "var(--radius-xs)",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: connectedAdmins.length > 0 ? "var(--color-success)" : "var(--color-text-muted)", fontWeight: "var(--font-weight-medium)" }}>
                <CheckIcon size={14} />
                <span>
                  {connectedAdmins.length > 0
                    ? `Active Admin Connection (${connectedAdmins.length})`
                    : "No Admin Connected Yet — Waiting for Admin connection"}
                </span>
              </div>
              {connectedAdmins.length > 0 && (
                <div style={{ marginTop: "4px", fontSize: "11px", fontFamily: "var(--font-mono)", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {connectedAdmins.map((adminIp) => (
                    <div key={adminIp} style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text)" }}>
                      <span>Admin Peer: {adminIp}</span>
                      <span style={{ color: "var(--color-success)", textTransform: "uppercase", fontSize: "10px" }}>Connected / Polling</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
              <strong>Admin Connection Instructions:</strong> To connect from another machine, open Fluffy on that machine, set its role to <strong>Admin</strong>, click <strong>"Add Node Manually"</strong>, and enter IP: <span style={{ fontFamily: "var(--font-mono)" }}>{detectedIp}</span> with Port: <span style={{ fontFamily: "var(--font-mono)" }}>9010</span>.
            </div>
          </div>
        )}

        {/* Detailed Admin Cluster Nodes & Command Console Card */}
        {role === "admin" && (
          <div
            style={{
              padding: "var(--space-4)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <ServerIcon size={16} style={{ color: "var(--color-info, #3b82f6)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-info, #3b82f6)" }}>
                  Admin Cluster Controller & Node Telemetry
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: machines.some((m) => m.online)
                      ? "rgba(34, 197, 94, 0.15)"
                      : "var(--color-surface)",
                    color: machines.some((m) => m.online)
                      ? "var(--color-success)"
                      : "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {machines.length > 0
                    ? `${machines.filter((m) => m.online).length} of ${machines.length} Node(s) Online`
                    : "No Remote Nodes Connected"}
                </span>
              </div>
            </div>

            {machines.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-3)",
                  backgroundColor: "var(--color-surface)",
                  borderRadius: "var(--radius-xs)",
                  border: "1px dashed var(--color-border)",
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  lineHeight: "1.5",
                }}
              >
                No remote cluster nodes attached yet. To connect a worker machine:
                <br />
                1. Ensure Fluffy is running on the worker machine with Role set to <strong>Available</strong>.
                <br />
                2. Click <strong>Add Node Manually</strong> above (or select <strong>Connect Node</strong> from Discovered Devices below) and enter its LAN IP.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {/* Node Selector Pills */}
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  {machines.map((m) => {
                    const isTarget = selectedTargetMachine?.machine_id === m.machine_id;
                    return (
                      <button
                        key={m.machine_id}
                        type="button"
                        onClick={() => networkStore.switchTarget(m.machine_id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          padding: "4px 10px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: isTarget ? "var(--color-surface)" : "transparent",
                          border: `1px solid ${isTarget ? "var(--color-accent)" : "var(--color-border)"}`,
                          color: "var(--color-text)",
                          fontSize: "11px",
                          fontWeight: isTarget ? "bold" : "normal",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: m.online ? "var(--color-success)" : "var(--color-danger)",
                          }}
                        />
                        <span>{m.name || m.ip}</span>
                        <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                          ({m.ip}:{m.port})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Node Real Telemetry Cards */}
                {selectedTargetMachine && (
                  <div
                    style={{
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-xs)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-3)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", flexWrap: "wrap", gap: "var(--space-2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <strong style={{ color: "var(--color-text)" }}>
                          {selectedTargetMachine.name || selectedTargetMachine.ip}
                        </strong>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-muted)" }}>
                          [{selectedTargetMachine.machine_id}] • {selectedTargetMachine.ip}:{selectedTargetMachine.port}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button
                          type="button"
                          onClick={() => handleAdminPing(selectedTargetMachine.machine_id)}
                          disabled={isAdminExecuting}
                          style={{
                            padding: "3px 8px",
                            fontSize: "11px",
                            backgroundColor: "var(--color-surface-elevated)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-xs)",
                            color: "var(--color-text)",
                            cursor: isAdminExecuting ? "not-allowed" : "pointer",
                          }}
                        >
                          Ping Node
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminScan(selectedTargetMachine.machine_id)}
                          disabled={isAdminExecuting}
                          style={{
                            padding: "3px 8px",
                            fontSize: "11px",
                            backgroundColor: "var(--color-surface-elevated)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-xs)",
                            color: "var(--color-text)",
                            cursor: isAdminExecuting ? "not-allowed" : "pointer",
                          }}
                        >
                          Diagnostic Scan
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(null as any, selectedTargetMachine.machine_id)}
                          disabled={isAdminExecuting}
                          style={{
                            padding: "3px 8px",
                            fontSize: "11px",
                            backgroundColor: "rgba(239, 68, 68, 0.15)",
                            color: "var(--color-danger)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: "var(--radius-xs)",
                            cursor: isAdminExecuting ? "not-allowed" : "pointer",
                          }}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>

                    {/* Live Metric KPIs */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "var(--space-2)",
                        fontSize: "11px",
                      }}
                    >
                      <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                        <div style={{ color: "var(--color-text-muted)" }}>Host / Platform</div>
                        <div style={{ fontWeight: "bold", marginTop: "2px", color: "var(--color-text)" }}>
                          {activeMachineData?.system?.hostname || selectedTargetMachine.name}
                        </div>
                        <div style={{ color: "var(--color-text-secondary)", fontSize: "10px" }}>
                          {activeMachineData?.system?.os || "unknown"} ({activeMachineData?.system?.arch || "unknown"})
                        </div>
                      </div>

                      <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                          <span>CPU Usage</span>
                          <span style={{ fontWeight: "bold", color: "var(--color-text)" }}>
                            {activeMachineData?.cpu?.usage_percent !== undefined
                              ? `${activeMachineData.cpu.usage_percent.toFixed(1)}%`
                              : "0.0%"}
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", backgroundColor: "var(--color-surface)", borderRadius: "3px", overflow: "hidden", marginTop: "6px" }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, activeMachineData?.cpu?.usage_percent || 0))}%`,
                              height: "100%",
                              backgroundColor: "var(--color-accent)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                          <span>RAM Allocation</span>
                          <span style={{ fontWeight: "bold", color: "var(--color-text)" }}>
                            {activeMachineData?.ram?.used_mb !== undefined
                              ? `${activeMachineData.ram.used_mb} MB`
                              : "0 MB"}
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", backgroundColor: "var(--color-surface)", borderRadius: "3px", overflow: "hidden", marginTop: "6px" }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, (activeMachineData?.ram?.used_mb && activeMachineData?.ram?.total_mb) ? (activeMachineData.ram.used_mb / activeMachineData.ram.total_mb) * 100 : 0))}%`,
                              height: "100%",
                              backgroundColor: "var(--color-success)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                          Total: {activeMachineData?.ram?.total_mb || 0} MB • Free: {activeMachineData?.ram?.free_mb || 0} MB
                        </div>
                      </div>

                      <div style={{ padding: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                        <div style={{ color: "var(--color-text-muted)" }}>Transport Status</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginTop: "2px" }}>
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: selectedTargetMachine.online ? "var(--color-success)" : "var(--color-danger)",
                            }}
                          />
                          <span style={{ fontWeight: "bold", color: selectedTargetMachine.online ? "var(--color-success)" : "var(--color-danger)" }}>
                            {selectedTargetMachine.online ? "ESTABLISHED" : "DISCONNECTED"}
                          </span>
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                          Monitor Port: {selectedTargetMachine.port}
                        </div>
                      </div>
                    </div>

                    {/* Top RAM Processes on Remote Machine */}
                    {activeMachineData?.processes?.top_ram && activeMachineData.processes.top_ram.length > 0 && (
                      <div style={{ fontSize: "11px" }}>
                        <span style={{ color: "var(--color-text-muted)", fontWeight: "bold" }}>Active Node Processes:</span>
                        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "4px" }}>
                          {activeMachineData.processes.top_ram.slice(0, 4).map((p, idx) => (
                            <span
                              key={`${p.pid || idx}-${p.name}`}
                              style={{
                                padding: "2px 6px",
                                borderRadius: "var(--radius-xs)",
                                backgroundColor: "var(--color-surface-elevated)",
                                border: "1px solid var(--color-border)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                              }}
                            >
                              {p.name} ({p.ram_mb} MB)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Direct Command Executor Console */}
                    <form
                      onSubmit={(e) => handleAdminSendCommand(e, selectedTargetMachine.machine_id)}
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        alignItems: "center",
                        marginTop: "var(--space-1)",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Send command or capability (e.g. ping, status, diagnostic_scan, System.GetHardware)..."
                        value={adminCommandInput}
                        onChange={(e) => setAdminCommandInput(e.target.value)}
                        disabled={isAdminExecuting}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          backgroundColor: "var(--color-surface-elevated)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-xs)",
                          color: "var(--color-text)",
                          fontSize: "12px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <button
                        type="submit"
                        disabled={isAdminExecuting || !adminCommandInput.trim()}
                        style={{
                          padding: "6px 14px",
                          fontSize: "11px",
                          fontWeight: "var(--font-weight-bold)",
                          backgroundColor: "var(--color-accent)",
                          color: "var(--color-background)",
                          border: "none",
                          borderRadius: "var(--radius-xs)",
                          cursor: isAdminExecuting || !adminCommandInput.trim() ? "not-allowed" : "pointer",
                          opacity: isAdminExecuting || !adminCommandInput.trim() ? 0.6 : 1,
                        }}
                      >
                        {isAdminExecuting ? "Sending..." : "Send Command"}
                      </button>
                    </form>

                    {/* Command Output Box */}
                    {adminCommandOutput && (
                      <div
                        style={{
                          padding: "var(--space-2) var(--space-3)",
                          backgroundColor: "var(--color-surface-elevated)",
                          border: `1px solid ${adminCommandOutput.isError ? "var(--color-danger)" : "var(--color-border)"}`,
                          borderRadius: "var(--radius-xs)",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: "10px" }}>
                          <span>Console Output • Node {selectedTargetMachine.machine_id}</span>
                          <span>{adminCommandOutput.timestamp}</span>
                        </div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: adminCommandOutput.isError ? "var(--color-danger)" : "var(--color-text)" }}>
                          {adminCommandOutput.text}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Node Modal (Admin Only) */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              width: "420px",
              maxWidth: "90vw",
              padding: "var(--space-5)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)" }}>
                Add Network Node
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
              Enter the IP address and port of the available Fluffy node you want to connect to.
            </p>

            {formError && (
              <div
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid var(--color-danger)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--color-danger)",
                  fontSize: "12px",
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  IP Address or Hostname *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.105"
                  value={nodeIp}
                  onChange={(e) => setNodeIp(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  Port *
                </label>
                <input
                  type="number"
                  placeholder="9000"
                  value={nodePort}
                  onChange={(e) => setNodePort(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  Node Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Worker-Node-1"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 14px",
                    fontSize: "12px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 16px",
                    fontSize: "12px",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-accent)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-background)",
                    cursor: isSubmitting ? "wait" : "pointer",
                  }}
                >
                  {isSubmitting ? "Connecting..." : "Add & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                        {n.id === "node_local" ? (
                          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                            Current Host (Self)
                          </span>
                        ) : isConnected ? (
                          <div style={{ display: "flex", gap: "var(--space-1)", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                networkStore.switchTarget(n.id);
                              }}
                              style={{
                                padding: "3px 8px",
                                fontSize: "11px",
                                fontWeight: "var(--font-weight-medium)",
                                backgroundColor: "var(--color-surface-elevated)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "var(--radius-xs)",
                                color: "var(--color-text)",
                                cursor: "pointer",
                              }}
                            >
                              Select
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDisconnect(e, n.id)}
                              disabled={isConnecting || isExecuting}
                              style={{
                                padding: "3px 8px",
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
                          </div>
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
              : role === "available"
              ? "Available mode active. This node is listening for Admin connections on port 9010 and does not manage remote nodes."
              : role === "admin"
              ? "No remote nodes connected yet. Click 'Add Node Manually' or use quick connect below to attach an available node."
              : "Standalone mode active. Switch to Admin to manage remote cluster nodes."}
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
                  <th style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>Actions</th>
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
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
                        {role === "admin" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickConnectDevice(d.ip_address, d.hostname || undefined);
                            }}
                            style={{
                              padding: "3px 8px",
                              fontSize: "11px",
                              fontWeight: "var(--font-weight-medium)",
                              backgroundColor: "rgba(59, 130, 246, 0.15)",
                              color: "var(--color-info, #3b82f6)",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              borderRadius: "var(--radius-xs)",
                              cursor: "pointer",
                            }}
                          >
                            Connect Node
                          </button>
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
              ? "Scanning subnet devices..."
              : "No subnet devices observed in current ARP cache."}
          </div>
        )}
      </div>
    </div>
  );
};
