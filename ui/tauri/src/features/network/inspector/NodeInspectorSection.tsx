/**
 * Fluffy Desktop - Node Inspector Section (Phase N11)
 * 
 * Displays authoritative properties and state for a selected NetworkNode.
 * Zero Emojis, Read-Only Projection.
 */

import React from "react";
import type { NetworkNode, NetworkConnection, NetworkEvent } from "../../../types/contracts";
import { uiStore } from "../../../stores/uiStore";
import {
  networkWorkspaceStore,
  useNetworkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import {
  CpuIcon,
  Share2Icon,
  ExternalLinkIcon,
} from "../../../components/common/Icons";

interface NodeInspectorSectionProps {
  node: NetworkNode;
  associatedConnections: NetworkConnection[];
  relatedEvents: NetworkEvent[];
}

export const NodeInspectorSection: React.FC<NodeInspectorSectionProps> = ({
  node,
  associatedConnections,
  relatedEvents,
}) => {
  const isConnected = node.availability === "connected";
  const isPairingOrAuth = node.availability === "pairing" || node.availability === "authenticating";

  const navTo = (view: string) => {
    uiStore.setActiveSidebarView(view);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* 1. Quick Navigation Actions */}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => navTo("topology")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            padding: "5px 8px",
            fontSize: "11px",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            cursor: "pointer",
          }}
        >
          <Share2Icon size={12} />
          <span>View in Topology</span>
        </button>
        <button
          type="button"
          onClick={() => navTo("systems")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            padding: "5px 8px",
            fontSize: "11px",
            fontWeight: "var(--font-weight-medium)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            cursor: "pointer",
          }}
        >
          <CpuIcon size={12} />
          <span>View in Systems</span>
        </button>
      </div>

      {/* 2. Identity & System Properties */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Node Identity
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Node ID:</span>
          <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{node.id}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Name:</span>
          <span style={{ fontWeight: "var(--font-weight-semibold)" }}>{node.name}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Hostname:</span>
          <span>{node.hostname || "Not set"}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Platform:</span>
          <span>{node.os} ({node.arch})</span>

          <span style={{ color: "var(--color-text-muted)" }}>Role:</span>
          <span>
            <span style={{ padding: "1px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", fontSize: "11px" }}>
              {node.role}
            </span>
          </span>
        </div>
      </div>

      {/* 3. Lifecycle, Availability & Trust */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Availability & Trust
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: "var(--space-1)", fontSize: "12px" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Availability:</span>
          <div>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                backgroundColor:
                  node.availability === "connected"
                    ? "rgba(34, 197, 94, 0.2)"
                    : node.availability === "available"
                    ? "rgba(59, 130, 246, 0.2)"
                    : isPairingOrAuth
                    ? "rgba(234, 179, 8, 0.2)"
                    : "rgba(239, 68, 68, 0.2)",
                color:
                  node.availability === "connected"
                    ? "var(--color-success)"
                    : node.availability === "available"
                    ? "var(--color-info, #3b82f6)"
                    : isPairingOrAuth
                    ? "var(--color-warning, #eab308)"
                    : "var(--color-danger)",
                fontSize: "11px",
                fontWeight: "bold",
              }}
            >
              {node.availability.toUpperCase()}
            </span>
          </div>

          <span style={{ color: "var(--color-text-muted)" }}>Pairing State:</span>
          <span>{node.pairing_state}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Auth State:</span>
          <span>{node.auth_state}</span>

          <span style={{ color: "var(--color-text-muted)" }}>Trust Mode:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text-secondary)" }}>
            {isConnected ? "legacy_compatibility (compatibility)" : "unlinked"}
          </span>

          <span style={{ color: "var(--color-text-muted)" }}>Last Seen:</span>
          <span>
            {node.last_seen_epoch
              ? new Date(node.last_seen_epoch * 1000).toLocaleTimeString()
              : "Never"}
          </span>
        </div>
      </div>

      {/* 4. Network Addresses */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          IP Addresses ({node.ip_addresses?.length ?? 0})
        </h4>
        {node.ip_addresses && node.ip_addresses.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            {node.ip_addresses.map((ip) => (
              <span
                key={ip}
                style={{
                  padding: "2px 6px",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                }}
              >
                {ip}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No IP addresses recorded</span>
        )}
      </div>

      {/* 5. Associated Active Connections */}
      <div
        style={{
          padding: "var(--space-3)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Active Connections ({associatedConnections.length})
        </h4>
        {associatedConnections.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {associatedConnections.map((c) => (
              <div
                key={c.id}
                onClick={() => networkWorkspaceStore.selectEntity("connection", c.id)}
                style={{
                  padding: "var(--space-2)",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--font-weight-semibold)" }}>{c.id}</span>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>
                    {c.protocol.toUpperCase()} • {c.local_port} → {c.remote_addr}:{c.remote_port}
                  </div>
                </div>
                <ExternalLinkIcon size={12} style={{ color: "var(--color-text-muted)" }} />
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No active connections</span>
        )}
      </div>

      {/* 6. Administrative Operations (Phase N13) */}
      {isConnected && (
        <AdminNodeControls node={node} />
      )}

      {/* 7. Recent Related Events */}
      {relatedEvents.length > 0 && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
            Recent Events ({relatedEvents.length})
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: "150px", overflowY: "auto" }}>
            {relatedEvents.slice(0, 5).map((e) => (
              <div
                key={e.event_id}
                style={{
                  padding: "4px 6px",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: "10px" }}>
                  <span>{e.event_type}</span>
                  <span>{new Date(e.timestamp_epoch_ms).toLocaleTimeString()}</span>
                </div>
                <div style={{ marginTop: "2px" }}>{e.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface AdminNodeControlsProps {
  node: NetworkNode;
}

const AdminNodeControls: React.FC<AdminNodeControlsProps> = ({ node }) => {
  const [activeTab, setActiveTab] = React.useState<"hardware" | "processes" | "terminate">("hardware");
  const [pidInput, setPidInput] = React.useState<string>("");
  const [confirmed, setConfirmed] = React.useState<boolean>(false);
  const [executing, setExecuting] = React.useState<boolean>(false);
  const [output, setOutput] = React.useState<string | null>(null);
  const [isError, setIsError] = React.useState<boolean>(false);

  const isStoreExecuting = useNetworkWorkspaceStore((s) => s.executingCommandNodeIds.has(node.id));

  const handleGetHardware = async () => {
    setExecuting(true);
    setOutput(null);
    setIsError(false);
    try {
      const res = await networkWorkspaceStore.executeCommand(node.id, "System.GetHardware", {}, true);
      if (res.success && res.data) {
        setOutput(JSON.stringify(res.data, null, 2));
      } else {
        setIsError(true);
        setOutput(res.error?.message || "Execution failed");
      }
    } catch (e: any) {
      setIsError(true);
      setOutput(e.message || "Failed to execute command");
    } finally {
      setExecuting(false);
    }
  };

  const handleListProcesses = async () => {
    setExecuting(true);
    setOutput(null);
    setIsError(false);
    try {
      const res = await networkWorkspaceStore.executeCommand(node.id, "Process.List", {}, true);
      if (res.success && res.data) {
        setOutput(JSON.stringify(res.data, null, 2));
      } else {
        setIsError(true);
        setOutput(res.error?.message || "Execution failed");
      }
    } catch (e: any) {
      setIsError(true);
      setOutput(e.message || "Failed to execute command");
    } finally {
      setExecuting(false);
    }
  };

  const handleTerminateProcess = async () => {
    const pid = parseInt(pidInput.trim(), 10);
    if (isNaN(pid) || pid <= 0) {
      setIsError(true);
      setOutput("Please enter a valid numeric Process ID (PID).");
      return;
    }
    if (!confirmed) {
      setIsError(true);
      setOutput("High-risk action requires confirmation check.");
      return;
    }

    setExecuting(true);
    setOutput(null);
    setIsError(false);
    try {
      const res = await networkWorkspaceStore.executeCommand(
        node.id,
        "Process.Terminate",
        { pid },
        confirmed
      );
      if (res.success) {
        setOutput(`Process PID ${pid} terminated successfully.`);
        setPidInput("");
        setConfirmed(false);
      } else {
        setIsError(true);
        setOutput(res.error?.message || "Failed to terminate process");
      }
    } catch (e: any) {
      setIsError(true);
      setOutput(e.message || "Failed to execute command");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      style={{
        padding: "var(--space-3)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.05em", margin: 0 }}>
          Admin Control Plane (N13)
        </h4>
        <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "rgba(34, 197, 94, 0.2)", color: "var(--color-success)", fontWeight: "bold" }}>
          Connected
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-1)", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("hardware")}
          style={{
            padding: "3px 8px",
            fontSize: "11px",
            backgroundColor: activeTab === "hardware" ? "var(--color-surface-elevated)" : "transparent",
            color: activeTab === "hardware" ? "var(--color-text)" : "var(--color-text-muted)",
            border: "none",
            borderRadius: "var(--radius-xs)",
            cursor: "pointer",
            fontWeight: activeTab === "hardware" ? "bold" : "normal",
          }}
        >
          Hardware
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("processes")}
          style={{
            padding: "3px 8px",
            fontSize: "11px",
            backgroundColor: activeTab === "processes" ? "var(--color-surface-elevated)" : "transparent",
            color: activeTab === "processes" ? "var(--color-text)" : "var(--color-text-muted)",
            border: "none",
            borderRadius: "var(--radius-xs)",
            cursor: "pointer",
            fontWeight: activeTab === "processes" ? "bold" : "normal",
          }}
        >
          Processes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("terminate")}
          style={{
            padding: "3px 8px",
            fontSize: "11px",
            backgroundColor: activeTab === "terminate" ? "var(--color-surface-elevated)" : "transparent",
            color: activeTab === "terminate" ? "var(--color-danger)" : "var(--color-text-muted)",
            border: "none",
            borderRadius: "var(--radius-xs)",
            cursor: "pointer",
            fontWeight: activeTab === "terminate" ? "bold" : "normal",
          }}
        >
          Kill Process
        </button>
      </div>

      {activeTab === "hardware" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={handleGetHardware}
            disabled={executing || isStoreExecuting}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: executing ? "not-allowed" : "pointer",
            }}
          >
            {executing ? "Querying Hardware..." : "Query Remote Hardware (System.GetHardware)"}
          </button>
        </div>
      )}

      {activeTab === "processes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={handleListProcesses}
            disabled={executing || isStoreExecuting}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              cursor: executing ? "not-allowed" : "pointer",
            }}
          >
            {executing ? "Listing Processes..." : "List Remote Processes (Process.List)"}
          </button>
        </div>
      )}

      {activeTab === "terminate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              type="number"
              placeholder="Target PID (e.g. 1234)"
              value={pidInput}
              onChange={(e) => setPidInput(e.target.value)}
              style={{
                flex: 1,
                padding: "4px 8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
              }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "11px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>Confirm process termination</span>
          </label>
          <button
            type="button"
            onClick={handleTerminateProcess}
            disabled={executing || isStoreExecuting || !confirmed || !pidInput.trim()}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-danger)",
              cursor: executing || !confirmed ? "not-allowed" : "pointer",
              opacity: executing || !confirmed ? 0.6 : 1,
            }}
          >
            {executing ? "Terminating..." : "Terminate Process (Process.Terminate)"}
          </button>
        </div>
      )}

      {output && (
        <div
          style={{
            marginTop: "var(--space-1)",
            padding: "var(--space-2)",
            backgroundColor: isError ? "rgba(239, 68, 68, 0.1)" : "var(--color-surface-elevated)",
            border: `1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-xs)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            maxHeight: "140px",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: isError ? "var(--color-danger)" : "var(--color-text)",
          }}
        >
          {output}
        </div>
      )}
    </div>
  );
};

