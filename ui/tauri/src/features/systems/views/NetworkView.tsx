/**
 * Fluffy Desktop - Network / Distributed LAN View
 * 
 * Manages peer-to-peer LAN node discovery, cluster roles (standalone, available, admin),
 * target machine switching, and remote machine telemetry inspection.
 */

import React, { useEffect, useState } from "react";
import { useNetworkStore, networkStore } from "../../../stores/networkStore";
import { NetworkNodeCard } from "../components/NetworkNodeCard";
import type { NetworkRole } from "../../../types/contracts";
import {
  ServerIcon,
  RefreshIcon,
  PlusIcon,
  CloseIcon,
  CheckIcon,
  CpuIcon,
  ActivityIcon,
  MemoryIcon,
  HardDriveIcon
} from "../../../components/common/Icons";

export const NetworkView: React.FC = () => {
  const role = useNetworkStore((s) => s.role);
  const machines = useNetworkStore((s) => s.machines);
  const activeMachineId = useNetworkStore((s) => s.activeMachineId);
  const activeMachineData = useNetworkStore((s) => s.activeMachineData);
  const loading = useNetworkStore((s) => s.loading);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [nodeIp, setNodeIp] = useState("");
  const [nodePort, setNodePort] = useState("9000");
  const [nodeName, setNodeName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Poll LAN discovery when Network view is mounted
  useEffect(() => {
    networkStore.startPolling();
    return () => {
      networkStore.stopPolling();
    };
  }, []);

  const handleRoleChange = async (newRole: NetworkRole) => {
    if (newRole === role) return;
    await networkStore.changeRole(newRole);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIp.trim()) {
      setFormError("IP address or hostname is required.");
      return;
    }

    const portNum = parseInt(nodePort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError("Port must be a valid number between 1 and 65535.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await networkStore.addNode(nodeIp.trim(), portNum, nodeName.trim() || undefined);
      setIsAddModalOpen(false);
      setNodeIp("");
      setNodeName("");
      setNodePort("9000");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add network node.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-background)",
      }}
    >
      {/* Network Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ color: "var(--color-accent)" }}>
            <ServerIcon size={18} />
          </span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
              }}
            >
              Distributed LAN & Peer Nodes
            </h2>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                marginTop: "2px",
              }}
            >
              Cluster Role: <strong style={{ color: "var(--color-text)" }}>{role.toUpperCase()}</strong> &bull;{" "}
              {role === "admin" ? `${machines.length} registered nodes` : "Local Node Mode"}
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {/* Role Selector Tabs */}
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
                disabled={loading}
                style={{
                  padding: "4px 10px",
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-medium)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: role === r ? "var(--color-surface-elevated)" : "transparent",
                  color: role === r ? "var(--color-accent)" : "var(--color-text-muted)",
                  cursor: loading ? "wait" : "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Add Node Button (Admin only) */}
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
              <span>Add Node</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => networkStore.refreshNow()}
            disabled={loading}
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
              cursor: loading ? "wait" : "pointer",
            }}
            title="Refresh Network Nodes"
          >
            <RefreshIcon size={12} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Role: Standalone Banner */}
        {role === "standalone" && (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: "var(--space-3)",
            }}
          >
            <ServerIcon size={36} style={{ color: "var(--color-text-muted)" }} />
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", color: "var(--color-text)" }}>
                Standalone Node Mode
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)", maxWidth: "480px" }}>
                This Fluffy instance is operating in isolated standalone mode. To participate in a distributed mesh or manage remote nodes, switch your network role.
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <button
                type="button"
                onClick={() => handleRoleChange("available")}
                style={{
                  padding: "6px 14px",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-medium)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                Make Available on LAN
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange("admin")}
                style={{
                  padding: "6px 14px",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-medium)",
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-background)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                Elevate to Cluster Admin
              </button>
            </div>
          </div>
        )}

        {/* Role: Available Banner */}
        {role === "available" && (
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-accent, var(--color-border))",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-success)",
                  boxShadow: "0 0 8px var(--color-success)",
                }}
              />
              <div>
                <div style={{ fontSize: "13px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)" }}>
                  Broadcasting as Available Node
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                  Listening for LAN discovery and admin requests on port 9000
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRoleChange("standalone")}
              style={{
                padding: "5px 12px",
                fontSize: "11px",
                backgroundColor: "var(--color-surface-subtle)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Return to Standalone
            </button>
          </div>
        )}

        {/* Role: Admin Cluster Nodes View */}
        {role === "admin" && (
          <>
            {/* Active Remote Machine Telemetry Banner if selected */}
            {activeMachineId && activeMachineData && (
              <div
                style={{
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <ActivityIcon size={16} style={{ color: "var(--color-accent)" }} />
                    <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                      Active Remote Target: {String(activeMachineData.name || activeMachineId)}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        backgroundColor: "var(--color-surface)",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {String(activeMachineData.ip || "")}:{String(activeMachineData.port || 9000)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => networkStore.switchTarget("")}
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-xs)",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    Disconnect / Local Host
                  </button>
                </div>

                {/* Remote Telemetry Metrics */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  <div
                    style={{
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                      <CpuIcon size={12} /> Remote CPU
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                      {typeof activeMachineData.cpu_percent === "number" ? `${activeMachineData.cpu_percent.toFixed(1)}%` : "N/A"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                      <MemoryIcon size={12} /> Remote RAM
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                      {typeof activeMachineData.ram_percent === "number" ? `${activeMachineData.ram_percent.toFixed(1)}%` : "N/A"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                      <HardDriveIcon size={12} /> Remote Disk
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                      {typeof activeMachineData.disk_percent === "number" ? `${activeMachineData.disk_percent.toFixed(1)}%` : "N/A"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "var(--space-3)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                      <ActivityIcon size={12} /> Active Processes
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                      {Array.isArray(activeMachineData.processes) ? activeMachineData.processes.length : "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Registered Nodes Grid */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Discovered LAN Nodes ({machines.length})
              </div>

              {machines.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  {machines.map((machine) => (
                    <NetworkNodeCard
                      key={machine.machine_id}
                      machine={machine}
                      isActive={activeMachineId === machine.machine_id}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "var(--space-8)",
                    border: "1px dashed var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-muted)",
                    fontSize: "12px",
                    textAlign: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <ServerIcon size={32} style={{ opacity: 0.4 }} />
                  <div>No remote LAN nodes discovered yet.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setIsAddModalOpen(true);
                    }}
                    style={{
                      marginTop: "var(--space-2)",
                      padding: "6px 12px",
                      fontSize: "11px",
                      backgroundColor: "var(--color-accent)",
                      color: "var(--color-background)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Add Node Manually
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Node Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            if (!isSubmitting) setIsAddModalOpen(false);
          }}
        >
          <div
            style={{
              width: "440px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-elevated)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)" }}>
                  <ServerIcon size={14} />
                </span>
                <span style={{ fontSize: "13px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
                  Register Remote LAN Node
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit} style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {formError && (
                <div
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    backgroundColor: "var(--color-danger-subtle)",
                    border: "1px solid var(--color-danger-border)",
                    color: "var(--color-danger)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "11px",
                  }}
                >
                  {formError}
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-text)",
                    marginBottom: "4px",
                  }}
                >
                  Node Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lab-Workstation-02"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-2)" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "var(--font-weight-medium)",
                      color: "var(--color-text)",
                      marginBottom: "4px",
                    }}
                  >
                    IP / Hostname
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.50"
                    value={nodeIp}
                    onChange={(e) => setNodeIp(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      backgroundColor: "var(--color-surface-subtle)",
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
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "var(--font-weight-medium)",
                      color: "var(--color-text)",
                      marginBottom: "4px",
                    }}
                  >
                    Port
                  </label>
                  <input
                    type="text"
                    placeholder="9000"
                    value={nodePort}
                    onChange={(e) => setNodePort(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      backgroundColor: "var(--color-surface-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "var(--space-2)",
                  marginTop: "var(--space-2)",
                  borderTop: "1px solid var(--color-border-subtle)",
                  paddingTop: "var(--space-3)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    backgroundColor: "var(--color-surface-subtle)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    padding: "6px 14px",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-background)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: isSubmitting ? "wait" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  <CheckIcon size={12} />
                  <span>{isSubmitting ? "Registering..." : "Add Node"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
