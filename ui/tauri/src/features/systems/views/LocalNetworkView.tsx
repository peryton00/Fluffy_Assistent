/**
 * Fluffy Desktop - Local Network Observability Workspace (Phase N5)
 * 
 * Provides an industrial-grade engineering console for host network observability:
 * 1. Summary Strip: Active NICs, LAN Devices, Sockets, Live Throughput, Wi-Fi Radio
 * 2. Interfaces & Traffic: Hardware NIC classification, IPv4/v6, MAC, Rx/Tx bandwidth rates
 * 3. Local Devices: Passive ARP table neighbor discovery with gateway & reachability states
 * 4. Active Flows: Socket-to-process flow mappings (PID, Process, Endpoints, Protocol, States)
 * 5. Wi-Fi Inspector: Saved profiles & active connection security posture (Zero Secrets)
 * 
 * Strictly separated from Cluster Mesh Networking (NetworkView.tsx).
 */

import React, { useEffect, useState, useMemo } from "react";
import { useLocalNetworkStore, localNetworkStoreManager } from "../../../stores/localNetworkStore";
import { useUiStore } from "../../../stores/uiStore";
import type {

  LocalNetworkInterface,
  LocalNetworkDevice,
  LocalNetworkFlow,
  LocalWifiProfile,
} from "../../../types/contracts";
import {
  ActivityIcon,
  RefreshIcon,
  WifiIcon,
  ServerIcon,
  SearchIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  ShieldCheckIcon,
} from "../../../components/common/Icons";

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatRate(bytesPerSec?: number | null): string {
  if (bytesPerSec === undefined || bytesPerSec === null || isNaN(bytesPerSec)) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

type NetworkTab = "overview" | "traffic" | "packet_monitor" | "interfaces" | "devices" | "flows" | "wifi";

export const LocalNetworkView: React.FC = () => {
  const {
    interfaces,
    devices,
    flows,
    wifiProfiles,
    trafficSummary,
    packetCaptureStatus,
    loading,
    isPolling,
    error,
    lastPolled,
  } = useLocalNetworkStore();


  const [activeTab, setActiveTab] = useState<NetworkTab>("overview");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [flowSearch, setFlowSearch] = useState("");
  const [flowProtocolFilter, setFlowProtocolFilter] = useState<string>("all");
  const [flowStateFilter, setFlowStateFilter] = useState<string>("all");

  // Start polling when mounted
  useEffect(() => {
    localNetworkStoreManager.startPolling();
    return () => {
      localNetworkStoreManager.stopPolling();
    };
  }, []);

  // Aggregated calculations
  const totalRxRate = useMemo(() => {
    return interfaces.reduce((acc, iface) => acc + (iface.rates?.rx_bytes_per_sec || 0), 0);
  }, [interfaces]);

  const totalTxRate = useMemo(() => {
    return interfaces.reduce((acc, iface) => acc + (iface.rates?.tx_bytes_per_sec || 0), 0);
  }, [interfaces]);

  const activeConnectedWifi = useMemo(() => {
    return wifiProfiles.find((w) => w.connected) || null;
  }, [wifiProfiles]);

  const physicalInterfaces = useMemo(() => {
    return interfaces.filter((i) => i.is_physical);
  }, [interfaces]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    if (!deviceSearch.trim()) return devices;
    const q = deviceSearch.toLowerCase();
    return devices.filter(
      (d) =>
        d.ip_address.toLowerCase().includes(q) ||
        (d.hostname && d.hostname.toLowerCase().includes(q)) ||
        (d.mac_address && d.mac_address.toLowerCase().includes(q))
    );
  }, [devices, deviceSearch]);

  // Filtered flows
  const filteredFlows = useMemo(() => {
    return flows.filter((f) => {
      if (flowProtocolFilter !== "all" && f.protocol.toLowerCase() !== flowProtocolFilter.toLowerCase()) {
        return false;
      }
      if (flowStateFilter !== "all" && f.state.toLowerCase() !== flowStateFilter.toLowerCase()) {
        return false;
      }
      if (!flowSearch.trim()) return true;
      const q = flowSearch.toLowerCase();
      return (
        f.local_address.toLowerCase().includes(q) ||
        String(f.local_port).includes(q) ||
        (f.remote_address && f.remote_address.toLowerCase().includes(q)) ||
        (f.remote_port && String(f.remote_port).includes(q)) ||
        (f.process_name && f.process_name.toLowerCase().includes(q)) ||
        (f.pid && String(f.pid).includes(q))
      );
    });
  }, [flows, flowProtocolFilter, flowStateFilter, flowSearch]);

  const handleManualRefresh = () => {
    localNetworkStoreManager.refreshNow();
  };

  const handleTogglePolling = () => {
    if (isPolling) {
      localNetworkStoreManager.stopPolling();
    } else {
      localNetworkStoreManager.startPolling();
    }
  };

  return (
    <div
      data-testid="local-network-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        width: "100%",
      }}
    >
      {/* Top Header & Freshness Control */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3) var(--space-4)",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-accent)",
            }}
          >
            <ActivityIcon size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h2
                style={{
                  fontSize: "14px",
                  fontWeight: "var(--font-weight-semibold, 600)",
                  margin: 0,
                  color: "var(--color-text)",
                }}
              >
                Local Host Network Observability
              </h2>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-xs)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: "bold",
                  backgroundColor: error
                    ? "var(--color-danger, #ef4444)"
                    : isPolling
                    ? "rgba(16, 185, 129, 0.2)"
                    : "var(--color-surface-elevated)",
                  color: error
                    ? "#ffffff"
                    : isPolling
                    ? "var(--color-success, #10b981)"
                    : "var(--color-text-muted)",
                }}
              >
                {error ? "ERROR" : isPolling ? "LIVE POLLING (5s)" : "MANUAL"}
              </span>
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                marginTop: "2px",
              }}
            >
              Authoritative Native Rust Observation Layer &middot; Last updated:{" "}
              {lastPolled ? new Date(lastPolled).toLocaleTimeString() : "Pending"}
            </div>
          </div>
        </div>

        {/* Refresh & Polling Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            onClick={() => useUiStore.getState().setActiveSidebarView("network_intelligence")}
            style={{
              padding: "var(--space-1) var(--space-3)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-accent, #3b82f6)",
              cursor: "pointer",
            }}
          >
            Network Intelligence (N9) &rarr;
          </button>
          <button
            onClick={handleTogglePolling}
            style={{
              padding: "var(--space-1) var(--space-3)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              backgroundColor: isPolling ? "var(--color-surface-hover)" : "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            {isPolling ? "Pause Polling" : "Resume Polling"}
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "var(--space-1) var(--space-3)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-accent, #3b82f6)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <RefreshIcon size={12} className={loading ? "spin" : ""} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>


      {/* Error Notice if Present */}
      {error && (
        <div
          data-testid="local-network-error"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--color-danger, #ef4444)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-danger, #ef4444)",
            fontSize: "12px",
          }}
        >
          <AlertTriangleIcon size={16} />
          <span>Observability error: {error.message}</span>
        </div>
      )}

      {/* Summary Stat Grid */}
      <div
        data-testid="local-network-summary"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {/* Card 1: Interfaces */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Network Interfaces
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
            {interfaces.filter((i) => i.is_up).length}{" "}
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>/ {interfaces.length} Total</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-dim)", marginTop: "2px" }}>
            {physicalInterfaces.length} Physical Hardware NICs
          </div>
        </div>

        {/* Card 2: LAN Devices */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Discovered LAN Devices
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
            {devices.length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-dim)", marginTop: "2px" }}>
            {devices.filter((d) => d.is_gateway).length} Gateways Identified
          </div>
        </div>

        {/* Card 3: Sockets / Flows */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Active Sockets / Flows
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
            {flows.length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-dim)", marginTop: "2px" }}>
            {flows.filter((f) => f.state.toLowerCase() === "established").length} Established &middot;{" "}
            {flows.filter((f) => f.state.toLowerCase() === "listen").length} Listeners
          </div>
        </div>

        {/* Card 4: Bandwidth Throughput */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Live Bandwidth Throughput
          </div>
          <div style={{ fontSize: "16px", fontWeight: "bold", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
            <span style={{ color: "var(--color-success, #10b981)" }}>&darr; {formatRate(totalRxRate)}</span> &middot;{" "}
            <span style={{ color: "var(--color-accent, #3b82f6)" }}>&uarr; {formatRate(totalTxRate)}</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-dim)", marginTop: "2px" }}>
            Instantaneous Host NIC Aggregate
          </div>
        </div>

        {/* Card 5: Wi-Fi Status */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Wi-Fi Radio
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold", fontFamily: "var(--font-mono)", marginTop: "4px" }}>
            {activeConnectedWifi ? (
              <span style={{ color: "var(--color-success, #10b981)" }}>
                {activeConnectedWifi.ssid} ({activeConnectedWifi.signal_percent ?? "?"}%)
              </span>
            ) : wifiProfiles.length > 0 ? (
              <span style={{ color: "var(--color-text-muted)" }}>Disconnected ({wifiProfiles.length} profiles)</span>
            ) : (
              <span style={{ color: "var(--color-text-dim)" }}>Wired / Unavailable</span>
            )}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-dim)", marginTop: "2px" }}>
            {activeConnectedWifi?.security || "No wireless security active"}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          gap: "var(--space-1)",
        }}
      >
        {(
          [
            { id: "overview", label: "Overview & Traffic" },
            { id: "traffic", label: `Traffic Aggregation (${trafficSummary?.processes?.length ?? 0})` },
            { id: "packet_monitor", label: `Packet Monitor (N8)${packetCaptureStatus?.is_active ? " ● ACTIVE" : ""}` },
            { id: "interfaces", label: `Interfaces (${interfaces.length})` },
            { id: "devices", label: `LAN Devices (${devices.length})` },
            { id: "flows", label: `Active Flows (${flows.length})` },
            { id: "wifi", label: `Wi-Fi Profiles (${wifiProfiles.length})` },
          ] as const
        ).map((tab) => (

          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              fontSize: "12px",
              fontWeight: activeTab === tab.id ? "600" : "normal",
              color: activeTab === tab.id ? "var(--color-accent, #3b82f6)" : "var(--color-text-muted)",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--color-accent, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Traffic Aggregation (N7) */}
      {activeTab === "traffic" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Summary Strip & Protocol/Direction Badges */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <ActivityIcon size={16} />
                <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: 0, textTransform: "uppercase", color: "var(--color-text)" }}>
                  Multi-Dimensional Flow & Traffic Aggregation
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {trafficSummary?.directions && Object.entries(trafficSummary.directions).map(([dir, count]) => (
                  <span
                    key={dir}
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {dir.toUpperCase()}: <strong>{count}</strong>
                  </span>
                ))}
                {trafficSummary?.protocols && Object.entries(trafficSummary.protocols).map(([proto, count]) => (
                  <span
                    key={proto}
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "var(--color-accent, #3b82f6)",
                    }}
                  >
                    {proto}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Top Processes by Traffic & Sockets */}
            <div style={{ marginTop: "var(--space-2)" }}>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>
                Process Traffic Attribution ({trafficSummary?.processes?.length ?? 0})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "6px 8px" }}>Process</th>
                      <th style={{ padding: "6px 8px" }}>PID</th>
                      <th style={{ padding: "6px 8px" }}>Active Sockets</th>
                      <th style={{ padding: "6px 8px" }}>Remote Destinations</th>
                      <th style={{ padding: "6px 8px" }}>Protocols</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Observed Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!trafficSummary?.processes || trafficSummary.processes.length === 0) ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "var(--color-text-muted)" }}>
                          No active process network traffic tracked.
                        </td>
                      </tr>
                    ) : (
                      trafficSummary.processes.map((p, idx) => (
                        <tr
                          key={`${p.process_name}-${p.pid}-${idx}`}
                          style={{
                            borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))",
                            backgroundColor: idx % 2 === 0 ? "transparent" : "var(--color-surface-elevated)",
                          }}
                        >
                          <td style={{ padding: "6px 8px", fontWeight: "600", color: "var(--color-text)" }}>
                            {p.process_name}
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                            {p.pid ?? "—"}
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>
                            {p.active_flows_count}
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>
                            {p.destinations_count}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            {p.protocols.join(", ") || "—"}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            <span style={{ color: "var(--color-accent, #3b82f6)" }}>&uarr; {formatRate(p.outbound_bytes_rate)}</span>{" "}
                            <span style={{ color: "var(--color-success, #10b981)" }}>&darr; {formatRate(p.inbound_bytes_rate)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Remote Destinations */}
            <div style={{ marginTop: "var(--space-3)" }}>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>
                Remote Destination Endpoints ({trafficSummary?.destinations?.length ?? 0})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "6px 8px" }}>Remote IP</th>
                      <th style={{ padding: "6px 8px" }}>Remote Port</th>
                      <th style={{ padding: "6px 8px" }}>Protocol</th>
                      <th style={{ padding: "6px 8px" }}>Active Flows</th>
                      <th style={{ padding: "6px 8px" }}>Associated Processes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!trafficSummary?.destinations || trafficSummary.destinations.length === 0) ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "var(--color-text-muted)" }}>
                          No active remote destinations observed.
                        </td>
                      </tr>
                    ) : (
                      trafficSummary.destinations.map((d, idx) => (
                        <tr
                          key={`${d.remote_address}-${d.remote_port}-${idx}`}
                          style={{
                            borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))",
                            backgroundColor: idx % 2 === 0 ? "transparent" : "var(--color-surface-elevated)",
                          }}
                        >
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                            {d.remote_address}
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                            {d.remote_port ?? "—"}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <span
                              style={{
                                fontSize: "10px",
                                fontFamily: "var(--font-mono)",
                                padding: "1px 5px",
                                borderRadius: "var(--radius-xs)",
                                backgroundColor: "var(--color-surface-elevated)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              {d.protocol}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>
                            {d.active_flows_count}
                          </td>
                          <td style={{ padding: "6px 8px", color: "var(--color-text-secondary)" }}>
                            {d.associated_processes.join(", ") || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Overview & Traffic */}
      {(activeTab === "overview" || activeTab === "interfaces") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Section: Interfaces */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: 0, textTransform: "uppercase", color: "var(--color-text)" }}>
                Host Network Interfaces & Bandwidth Counters
              </h3>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                {interfaces.length} Adapters Enumerated
              </span>
            </div>

            {interfaces.length === 0 ? (
              <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--color-text-muted)", fontSize: "12px" }}>
                No network interfaces reported by Rust Core.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "11px" }}>
                      <th style={{ padding: "6px 8px" }}>Name / Description</th>
                      <th style={{ padding: "6px 8px" }}>Type</th>
                      <th style={{ padding: "6px 8px" }}>Status</th>
                      <th style={{ padding: "6px 8px" }}>IP Addresses</th>
                      <th style={{ padding: "6px 8px" }}>MAC</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Download (Rx)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Upload (Tx)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Total Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interfaces.map((iface) => (
                      <tr
                        key={iface.id || iface.name}
                        style={{
                          borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <td style={{ padding: "8px 8px" }}>
                          <div style={{ fontWeight: "bold", color: "var(--color-text)" }}>{iface.name}</div>
                          {iface.description && (
                            <div style={{ fontSize: "10px", color: "var(--color-text-dim)" }}>{iface.description}</div>
                          )}
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "var(--radius-xs)",
                              backgroundColor: iface.is_physical ? "rgba(59, 130, 246, 0.15)" : "rgba(107, 114, 128, 0.15)",
                              color: iface.is_physical ? "var(--color-accent, #3b82f6)" : "var(--color-text-muted)",
                            }}
                          >
                            {iface.interface_type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              color: iface.is_up ? "var(--color-success, #10b981)" : "var(--color-text-dim)",
                            }}
                          >
                            <span
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                backgroundColor: iface.is_up ? "var(--color-success, #10b981)" : "var(--color-text-dim)",
                              }}
                            />
                            {iface.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "8px 8px", fontSize: "11px" }}>
                          {iface.ipv4_addresses.length > 0
                            ? iface.ipv4_addresses.join(", ")
                            : iface.ipv6_addresses.length > 0
                            ? iface.ipv6_addresses[0]
                            : "—"}
                        </td>
                        <td style={{ padding: "8px 8px", fontSize: "11px", color: "var(--color-text-dim)" }}>
                          {iface.mac_address || "—"}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--color-success, #10b981)" }}>
                          {formatRate(iface.rates?.rx_bytes_per_sec)}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--color-accent, #3b82f6)" }}>
                          {formatRate(iface.rates?.tx_bytes_per_sec)}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {formatBytes(iface.total_received_bytes)} &darr; / {formatBytes(iface.total_transmitted_bytes)} &uarr;
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: LAN Devices */}
      {(activeTab === "overview" || activeTab === "devices") && (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-3)",
              flexWrap: "wrap",
              gap: "var(--space-2)",
            }}
          >
            <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: 0, textTransform: "uppercase", color: "var(--color-text)" }}>
              Passive Local Network Discovery (OS ARP Cache)
            </h3>
            <div style={{ position: "relative", minWidth: "220px" }}>
              <input
                type="text"
                placeholder="Filter IP, hostname, MAC..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 8px 4px 28px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text)",
                }}
              />
              <span style={{ position: "absolute", left: "8px", top: "7px", color: "var(--color-text-muted)" }}>
                <SearchIcon size={12} />
              </span>
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--color-text-muted)", fontSize: "12px" }}>
              No local subnet devices currently reported in neighbor cache.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "11px" }}>
                    <th style={{ padding: "6px 8px" }}>IP Address</th>
                    <th style={{ padding: "6px 8px" }}>MAC Address</th>
                    <th style={{ padding: "6px 8px" }}>Hostname</th>
                    <th style={{ padding: "6px 8px" }}>Interface</th>
                    <th style={{ padding: "6px 8px" }}>Role / Flags</th>
                    <th style={{ padding: "6px 8px" }}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((dev) => (
                    <tr
                      key={dev.ip_address}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <td style={{ padding: "8px 8px", fontWeight: "bold", color: "var(--color-text)" }}>
                        {dev.ip_address}
                      </td>
                      <td style={{ padding: "8px 8px", color: "var(--color-text-muted)" }}>
                        {dev.mac_address || "—"}
                      </td>
                      <td style={{ padding: "8px 8px", color: dev.hostname ? "var(--color-text)" : "var(--color-text-dim)" }}>
                        {dev.hostname || "—"}
                      </td>
                      <td style={{ padding: "8px 8px", fontSize: "11px", color: "var(--color-text-dim)" }}>
                        {dev.interface_name || "—"}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {dev.is_gateway && (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "1px 6px",
                                borderRadius: "var(--radius-xs)",
                                backgroundColor: "rgba(245, 158, 11, 0.2)",
                                color: "var(--color-warning, #f59e0b)",
                                fontWeight: "bold",
                              }}
                            >
                              GATEWAY
                            </span>
                          )}
                          {dev.is_self && (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "1px 6px",
                                borderRadius: "var(--radius-xs)",
                                backgroundColor: "rgba(59, 130, 246, 0.2)",
                                color: "var(--color-accent, #3b82f6)",
                              }}
                            >
                              LOCALHOST
                            </span>
                          )}
                          {!dev.is_gateway && !dev.is_self && (
                            <span style={{ fontSize: "10px", color: "var(--color-text-dim)" }}>Neighbor</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor:
                              dev.state.toLowerCase() === "reachable"
                                ? "rgba(16, 185, 129, 0.15)"
                                : dev.state.toLowerCase() === "permanent"
                                ? "rgba(59, 130, 246, 0.15)"
                                : "rgba(107, 114, 128, 0.15)",
                            color:
                              dev.state.toLowerCase() === "reachable"
                                ? "var(--color-success, #10b981)"
                                : dev.state.toLowerCase() === "permanent"
                                ? "var(--color-accent, #3b82f6)"
                                : "var(--color-text-muted)",
                          }}
                        >
                          {dev.state.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Active Flows */}
      {(activeTab === "overview" || activeTab === "flows") && (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-3)",
              flexWrap: "wrap",
              gap: "var(--space-2)",
            }}
          >
            <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: 0, textTransform: "uppercase", color: "var(--color-text)" }}>
              Active Socket-to-Process Flow Mapping ({filteredFlows.length})
            </h3>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {/* Protocol filter */}
              <select
                value={flowProtocolFilter}
                onChange={(e) => setFlowProtocolFilter(e.target.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text)",
                }}
              >
                <option value="all">Protocol: All</option>
                <option value="tcp">TCP Only</option>
                <option value="udp">UDP Only</option>
              </select>

              {/* State filter */}
              <select
                value={flowStateFilter}
                onChange={(e) => setFlowStateFilter(e.target.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text)",
                }}
              >
                <option value="all">State: All</option>
                <option value="listen">LISTEN</option>
                <option value="established">ESTABLISHED</option>
                <option value="time_wait">TIME_WAIT</option>
                <option value="close_wait">CLOSE_WAIT</option>
              </select>

              {/* Search filter */}
              <div style={{ position: "relative", minWidth: "180px" }}>
                <input
                  type="text"
                  placeholder="Filter process, port..."
                  value={flowSearch}
                  onChange={(e) => setFlowSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 8px 4px 28px",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                  }}
                />
                <span style={{ position: "absolute", left: "8px", top: "7px", color: "var(--color-text-muted)" }}>
                  <SearchIcon size={12} />
                </span>
              </div>
            </div>
          </div>

          {filteredFlows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--color-text-muted)", fontSize: "12px" }}>
              No active socket flows matching filter.
            </div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "11px" }}>
                    <th style={{ padding: "6px 8px" }}>Process</th>
                    <th style={{ padding: "6px 8px" }}>PID</th>
                    <th style={{ padding: "6px 8px" }}>Proto</th>
                    <th style={{ padding: "6px 8px" }}>Local Endpoint</th>
                    <th style={{ padding: "6px 8px" }}>Remote Endpoint</th>
                    <th style={{ padding: "6px 8px" }}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlows.slice(0, 150).map((f, idx) => (
                    <tr
                      key={`${f.protocol}-${f.local_address}-${f.local_port}-${f.remote_address}-${f.remote_port}-${idx}`}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: "bold", color: "var(--color-text)" }}>
                        {f.process_name || "Unknown"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--color-text-muted)" }}>
                        {f.pid ?? "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor: f.protocol.toUpperCase() === "TCP" ? "rgba(59, 130, 246, 0.15)" : "rgba(245, 158, 11, 0.15)",
                            color: f.protocol.toUpperCase() === "TCP" ? "var(--color-accent, #3b82f6)" : "var(--color-warning, #f59e0b)",
                          }}
                        >
                          {f.protocol.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--color-text)" }}>
                        {f.local_address}:{f.local_port}
                      </td>
                      <td style={{ padding: "6px 8px", color: f.remote_address ? "var(--color-text)" : "var(--color-text-dim)" }}>
                        {f.remote_address ? `${f.remote_address}:${f.remote_port ?? "*"}` : "*:*"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "var(--radius-xs)",
                            backgroundColor:
                              f.state.toUpperCase() === "ESTABLISHED"
                                ? "rgba(16, 185, 129, 0.15)"
                                : f.state.toUpperCase() === "LISTEN"
                                ? "rgba(59, 130, 246, 0.15)"
                                : "rgba(107, 114, 128, 0.15)",
                            color:
                              f.state.toUpperCase() === "ESTABLISHED"
                                ? "var(--color-success, #10b981)"
                                : f.state.toUpperCase() === "LISTEN"
                                ? "var(--color-accent, #3b82f6)"
                                : "var(--color-text-muted)",
                          }}
                        >
                          {f.state.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredFlows.length > 150 && (
                <div style={{ textAlign: "center", padding: "var(--space-2)", fontSize: "11px", color: "var(--color-text-dim)" }}>
                  Showing 150 of {filteredFlows.length} flows. Use search to narrow down results.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Wi-Fi Profiles & Security Inspector */}
      {(activeTab === "overview" || activeTab === "wifi") && (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <WifiIcon size={16} />
              <h3 style={{ fontSize: "13px", fontWeight: "bold", margin: 0, textTransform: "uppercase", color: "var(--color-text)" }}>
                Wi-Fi Profiles & Security Posture ({wifiProfiles.length})
              </h3>
            </div>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              Zero-Credential Metadata Only
            </span>
          </div>

          {wifiProfiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--color-text-muted)", fontSize: "12px" }}>
              No saved Wi-Fi profiles available or Wi-Fi hardware not present on host.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {wifiProfiles.map((prof) => (
                <div
                  key={prof.ssid}
                  style={{
                    backgroundColor: prof.connected ? "var(--color-surface-hover)" : "var(--color-surface-elevated)",
                    border: prof.connected ? "1px solid var(--color-accent, #3b82f6)" : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "13px", color: "var(--color-text)" }}>
                        {prof.ssid}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--color-text-dim)", fontFamily: "var(--font-mono)" }}>
                        Adapter: {prof.interface_name || "Wi-Fi"}
                      </div>
                    </div>
                    {prof.connected && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "bold",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: "rgba(16, 185, 129, 0.2)",
                          color: "var(--color-success, #10b981)",
                        }}
                      >
                        CONNECTED
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <ShieldCheckIcon size={14} color="var(--color-accent, #3b82f6)" />
                      <span style={{ color: "var(--color-text-muted)" }}>Security:</span>
                      <span style={{ fontWeight: "bold", color: "var(--color-text)" }}>{prof.security || "Open"}</span>
                    </div>
                    {prof.cipher && (
                      <span style={{ fontSize: "10px", color: "var(--color-text-dim)", fontFamily: "var(--font-mono)" }}>
                        Cipher: {prof.cipher}
                      </span>
                    )}
                  </div>

                  {prof.signal_percent !== null && prof.signal_percent !== undefined && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-dim)", marginBottom: "2px" }}>
                        <span>Signal Quality</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold", color: "var(--color-text)" }}>
                          {prof.signal_percent}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "4px",
                          backgroundColor: "var(--color-surface)",
                          borderRadius: "var(--radius-xs)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${prof.signal_percent}%`,
                            height: "100%",
                            backgroundColor:
                              prof.signal_percent > 70
                                ? "var(--color-success, #10b981)"
                                : prof.signal_percent > 40
                                ? "var(--color-warning, #f59e0b)"
                                : "var(--color-danger, #ef4444)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Packet Monitor (N8 / SIH26117) */}
      {activeTab === "packet_monitor" && (
        <div data-testid="packet-monitor-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Controls & Metrics Strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
              flexWrap: "wrap",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  fontFamily: "var(--font-mono)",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: packetCaptureStatus?.is_active ? "rgba(16, 185, 129, 0.2)" : "var(--color-surface-elevated)",
                  color: packetCaptureStatus?.is_active ? "var(--color-success, #10b981)" : "var(--color-text-muted)",
                  border: packetCaptureStatus?.is_active ? "1px solid var(--color-success, #10b981)" : "1px solid var(--color-border)",
                }}
              >
                {packetCaptureStatus?.is_active ? "● ACTIVE (N8/SIH26117)" : "○ IDLE"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                {packetCaptureStatus?.interface_name ? `Interface: ${packetCaptureStatus.interface_name}` : "All Interfaces"} | Duration: {packetCaptureStatus?.duration_seconds?.toFixed(1) ?? "0.0"}s / {packetCaptureStatus?.max_duration_seconds ?? 60}s
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {packetCaptureStatus?.is_active ? (
                <button
                  data-testid="stop-capture-btn"
                  onClick={() => localNetworkStoreManager.stopPacketCapture()}
                  style={{
                    padding: "var(--space-1) var(--space-3)",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: "var(--color-danger, #ef4444)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Stop Monitor
                </button>
              ) : (
                <button
                  data-testid="start-capture-btn"
                  onClick={() => localNetworkStoreManager.startPacketCapture({ duration_seconds: 60, max_packets: 100 })}
                  style={{
                    padding: "var(--space-1) var(--space-3)",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: "var(--color-accent, #3b82f6)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Start 60s Session
                </button>
              )}
              <button
                onClick={() => localNetworkStoreManager.refreshPacketCaptureStatus()}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                Poll Status
              </button>
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Packets Observed</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", fontFamily: "var(--font-mono)", color: "var(--color-accent, #3b82f6)", marginTop: "2px" }}>
                {packetCaptureStatus?.packets_observed ?? 0}
              </div>
            </div>
            <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Packets Dropped</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", fontFamily: "var(--font-mono)", color: (packetCaptureStatus?.packets_dropped ?? 0) > 0 ? "var(--color-warning, #f59e0b)" : "var(--color-text)", marginTop: "2px" }}>
                {packetCaptureStatus?.packets_dropped ?? 0}
              </div>
            </div>
            <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Current Rate</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", fontFamily: "var(--font-mono)", color: "var(--color-success, #10b981)", marginTop: "2px" }}>
                {packetCaptureStatus?.current_rate_pps?.toFixed(1) ?? "0.0"} PPS
              </div>
            </div>
            <div style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Buffer Capacity</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
                {packetCaptureStatus?.observations?.length ?? 0} / 200 Max
              </div>
            </div>
          </div>

          {/* Privacy & Security Invariant Banner */}
          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              backgroundColor: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <ShieldCheckIcon size={14} color="var(--color-accent, #3b82f6)" />
            <span>
              <strong>Metadata-Only Invariant:</strong> Captures 5-tuples, timestamps, protocols, and TCP flags for SIH air-gap and egress verification. Application payloads and credentials are never captured or stored.
            </span>
          </div>

          {/* Bounded Packet Metadata Table */}
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--space-3)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                Recent Packet Observations ({packetCaptureStatus?.observations?.length ?? 0})
              </div>
            </div>

            {(!packetCaptureStatus?.observations || packetCaptureStatus.observations.length === 0) ? (
              <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--color-text-dim)", fontSize: "12px" }}>
                No packet observations in buffer. Click "Start 60s Session" to begin passive monitoring.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-surface-elevated)", borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                      <th style={{ padding: "var(--space-2)" }}>Protocol</th>
                      <th style={{ padding: "var(--space-2)" }}>Direction</th>
                      <th style={{ padding: "var(--space-2)" }}>Source</th>
                      <th style={{ padding: "var(--space-2)" }}>Destination</th>
                      <th style={{ padding: "var(--space-2)" }}>Size</th>
                      <th style={{ padding: "var(--space-2)" }}>TCP Flags</th>
                      <th style={{ padding: "var(--space-2)" }}>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packetCaptureStatus.observations.map((pkt) => (
                      <tr key={pkt.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "var(--space-2)", textTransform: "uppercase", fontWeight: "bold", color: pkt.protocol === "tcp" ? "var(--color-accent)" : pkt.protocol === "udp" ? "var(--color-warning)" : "var(--color-text)" }}>
                          {pkt.protocol}
                        </td>
                        <td style={{ padding: "var(--space-2)", textTransform: "capitalize" }}>
                          {pkt.direction}
                        </td>
                        <td style={{ padding: "var(--space-2)" }}>
                          {pkt.source_ip}{pkt.source_port ? `:${pkt.source_port}` : ""}
                        </td>
                        <td style={{ padding: "var(--space-2)" }}>
                          {pkt.destination_ip}{pkt.destination_port ? `:${pkt.destination_port}` : ""}
                        </td>
                        <td style={{ padding: "var(--space-2)" }}>
                          {pkt.packet_size_bytes} B
                        </td>
                        <td style={{ padding: "var(--space-2)", color: "var(--color-text-muted)" }}>
                          {pkt.tcp_flags ? (
                            [
                              pkt.tcp_flags.syn && "SYN",
                              pkt.tcp_flags.ack && "ACK",
                              pkt.tcp_flags.fin && "FIN",
                              pkt.tcp_flags.rst && "RST",
                              pkt.tcp_flags.psh && "PSH",
                              pkt.tcp_flags.urg && "URG",
                            ]
                              .filter(Boolean)
                              .join(" ") || "None"
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ padding: "var(--space-2)", color: "var(--color-text-dim)" }}>
                          {pkt.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

