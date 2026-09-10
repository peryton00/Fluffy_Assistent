/**
 * Fluffy Desktop - Advanced Network Intelligence Workspace (Phase N9.4)
 * 
 * Provides an industrial-grade engineering console for interpreted network intelligence:
 * 1. Overview Tab: Network environment fingerprint, confidence, trust level, device/service tallies, insights, recent events.
 * 2. Devices Tab: Classified subnet devices with role categories, confidence, presence lifecycle, and evidence inspection.
 * 3. Services Tab: Managed local listening service catalog with lifecycle states (ACTIVE, TRANSIENT, INACTIVE).
 * 4. Changes Tab: Bounded chronological timeline of network transitions from N9 ring buffer.
 * 5. Inspector Panel: Deep entity inspection for selected device or service.
 * 
 * Strict Security Invariants:
 * - Read-only visualization; zero mutation, packet capture, or secret exposure.
 * - Authority invariant: N6 Guardian remains sole authority for security alerts and verdicts.
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  useNetworkIntelligenceStore,
  networkIntelligenceStoreManager,
} from "../../../stores/networkIntelligenceStore";
import { useUiStore } from "../../../stores/uiStore";
import type {
  DeviceCategory,
} from "../../../types/contracts";
import {
  ActivityIcon,
  RefreshIcon,
  SearchIcon,
  ServerIcon,
  LayersIcon,
  CpuIcon,
  CloseIcon,
  GlobeIcon,
} from "../../../components/common/Icons";

type IntelligenceTab = "overview" | "devices" | "services" | "changes";

export const NetworkIntelligenceView: React.FC = () => {
  const {
    summary,
    devices,
    services,
    changes,
    loading,
    isPolling,
    error,
    lastPolled,
    selectedDeviceId,
    selectedServiceId,
  } = useNetworkIntelligenceStore();

  const setActiveDomain = useUiStore((s) => s.setActiveDomain);
  const setActiveSidebarView = useUiStore((s) => s.setActiveSidebarView);

  const [activeTab, setActiveTab] = useState<IntelligenceTab>("overview");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceRoleFilter, setDeviceRoleFilter] = useState<string>("ALL");
  const [devicePresenceFilter, setDevicePresenceFilter] = useState<string>("all");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceStatusFilter, setServiceStatusFilter] = useState<string>("ALL");
  const [changesLimit, setChangesLimit] = useState<number>(50);

  // Polling lifecycle
  useEffect(() => {
    networkIntelligenceStoreManager.startPolling();
    return () => {
      networkIntelligenceStoreManager.stopPolling();
    };
  }, []);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (deviceRoleFilter !== "ALL" && d.classification.toUpperCase() !== deviceRoleFilter) {
        return false;
      }
      if (devicePresenceFilter !== "all") {
        const p = d.status.toLowerCase();
        if (devicePresenceFilter === "active" && !p.includes("active") && !p.includes("reachable")) return false;
        if (devicePresenceFilter === "inactive" && (p.includes("active") || p.includes("reachable"))) return false;
      }
      if (!deviceSearch.trim()) return true;
      const q = deviceSearch.toLowerCase();
      const ipMatch = d.ip_addresses.some((ip) => ip.toLowerCase().includes(q));
      const macMatch = d.mac_address?.toLowerCase().includes(q) ?? false;
      const hostMatch = d.hostname?.toLowerCase().includes(q) ?? false;
      const vendorMatch = d.vendor?.toLowerCase().includes(q) ?? false;
      const aliasMatch = d.user_alias?.toLowerCase().includes(q) ?? false;
      return ipMatch || macMatch || hostMatch || vendorMatch || aliasMatch;
    });
  }, [devices, deviceRoleFilter, devicePresenceFilter, deviceSearch]);

  // Filtered services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (serviceStatusFilter !== "ALL" && s.status.toUpperCase() !== serviceStatusFilter) {
        return false;
      }
      if (!serviceSearch.trim()) return true;
      const q = serviceSearch.toLowerCase();
      const nameMatch = s.process_name.toLowerCase().includes(q);
      const portMatch = String(s.port).includes(q);
      const addrMatch = s.local_address.toLowerCase().includes(q);
      const wellKnownMatch = s.well_known_name?.toLowerCase().includes(q) ?? false;
      return nameMatch || portMatch || addrMatch || wellKnownMatch;
    });
  }, [services, serviceStatusFilter, serviceSearch]);

  // Selected device / service entities for Inspector
  const selectedDevice = useMemo(() => {
    if (!selectedDeviceId) return null;
    return devices.find((d) => d.device_id === selectedDeviceId) || null;
  }, [devices, selectedDeviceId]);

  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;
    return services.find((s) => s.service_id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  const handleTogglePolling = () => {
    if (isPolling) {
      networkIntelligenceStoreManager.stopPolling();
    } else {
      networkIntelligenceStoreManager.startPolling();
    }
  };

  const handleManualRefresh = () => {
    networkIntelligenceStoreManager.refreshNow();
  };

  const handleCloseInspector = () => {
    networkIntelligenceStoreManager.selectDevice(null);
    networkIntelligenceStoreManager.selectService(null);
  };

  const renderConfidenceBadge = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    let color = "var(--color-text-muted)";
    let bg = "var(--color-surface-elevated)";
    if (confidence >= 0.8) {
      color = "var(--color-success, #10b981)";
      bg = "rgba(16, 185, 129, 0.15)";
    } else if (confidence >= 0.5) {
      color = "#f59e0b";
      bg = "rgba(245, 158, 11, 0.15)";
    }
    return (
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          fontWeight: "600",
          color,
          backgroundColor: bg,
          padding: "2px 6px",
          borderRadius: "var(--radius-xs)",
        }}
      >
        {pct}%
      </span>
    );
  };

  const renderClassificationBadge = (cat: DeviceCategory) => {
    const c = cat.toUpperCase();
    let bg = "var(--color-surface-elevated)";
    let fg = "var(--color-text-muted)";
    if (c === "GATEWAY" || c === "ROUTER") {
      bg = "rgba(59, 130, 246, 0.15)";
      fg = "#3b82f6";
    } else if (c === "WORKSTATION" || c === "LAPTOP") {
      bg = "rgba(139, 92, 246, 0.15)";
      fg = "#8b5cf6";
    } else if (c === "PHONE" || c === "TABLET") {
      bg = "rgba(16, 185, 129, 0.15)";
      fg = "#10b981";
    } else if (c === "IOT" || c === "PRINTER") {
      bg = "rgba(245, 158, 11, 0.15)";
      fg = "#f59e0b";
    }
    return (
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          fontWeight: "600",
          color: fg,
          backgroundColor: bg,
          padding: "2px 6px",
          borderRadius: "var(--radius-xs)",
        }}
      >
        {c}
      </span>
    );
  };

  const renderServiceStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    let bg = "var(--color-surface-elevated)";
    let fg = "var(--color-text-muted)";
    if (s === "ACTIVE") {
      bg = "rgba(16, 185, 129, 0.15)";
      fg = "#10b981";
    } else if (s === "TRANSIENT") {
      bg = "rgba(245, 158, 11, 0.15)";
      fg = "#f59e0b";
    } else if (s === "INACTIVE") {
      bg = "rgba(239, 68, 68, 0.15)";
      fg = "#ef4444";
    }
    return (
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          fontWeight: "600",
          color: fg,
          backgroundColor: bg,
          padding: "2px 6px",
          borderRadius: "var(--radius-xs)",
        }}
      >
        {s}
      </span>
    );
  };

  return (
    <div
      data-testid="network-intelligence-view"
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
              color: "var(--color-accent, #3b82f6)",
            }}
          >
            <GlobeIcon size={18} />
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
                Network Intelligence (N9)
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
                    : summary?.freshness?.is_stale
                    ? "rgba(245, 158, 11, 0.2)"
                    : isPolling
                    ? "rgba(16, 185, 129, 0.2)"
                    : "var(--color-surface-elevated)",
                  color: error
                    ? "#ffffff"
                    : summary?.freshness?.is_stale
                    ? "#f59e0b"
                    : isPolling
                    ? "var(--color-success, #10b981)"
                    : "var(--color-text-muted)",
                }}
              >
                {error
                  ? "API ERROR"
                  : summary?.freshness?.is_stale
                  ? "STALE DATA"
                  : isPolling
                  ? "LIVE POLLING (5s)"
                  : "MANUAL"}
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
              Interpreted Environment Fingerprinting &middot; Device Roles &middot; Service Lifecycle &middot; Last updated:{" "}
              {lastPolled ? new Date(lastPolled).toLocaleTimeString() : "Pending"}
            </div>
          </div>
        </div>

        {/* Refresh & Polling Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
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
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshIcon size={12} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Subsystem Navigation Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          gap: "var(--space-2)",
          paddingBottom: "var(--space-1)",
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            fontWeight: activeTab === "overview" ? "bold" : "normal",
            backgroundColor: activeTab === "overview" ? "var(--color-surface-elevated)" : "transparent",
            border: "1px solid",
            borderColor: activeTab === "overview" ? "var(--color-border)" : "transparent",
            borderBottom: activeTab === "overview" ? "2px solid var(--color-accent, #3b82f6)" : "none",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            color: activeTab === "overview" ? "var(--color-text)" : "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <LayersIcon size={14} />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("devices")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            fontWeight: activeTab === "devices" ? "bold" : "normal",
            backgroundColor: activeTab === "devices" ? "var(--color-surface-elevated)" : "transparent",
            border: "1px solid",
            borderColor: activeTab === "devices" ? "var(--color-border)" : "transparent",
            borderBottom: activeTab === "devices" ? "2px solid var(--color-accent, #3b82f6)" : "none",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            color: activeTab === "devices" ? "var(--color-text)" : "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <CpuIcon size={14} />
          <span>Classified Devices ({devices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("services")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            fontWeight: activeTab === "services" ? "bold" : "normal",
            backgroundColor: activeTab === "services" ? "var(--color-surface-elevated)" : "transparent",
            border: "1px solid",
            borderColor: activeTab === "services" ? "var(--color-border)" : "transparent",
            borderBottom: activeTab === "services" ? "2px solid var(--color-accent, #3b82f6)" : "none",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            color: activeTab === "services" ? "var(--color-text)" : "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <ServerIcon size={14} />
          <span>Local Service Catalog ({services.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("changes")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            fontWeight: activeTab === "changes" ? "bold" : "normal",
            backgroundColor: activeTab === "changes" ? "var(--color-surface-elevated)" : "transparent",
            border: "1px solid",
            borderColor: activeTab === "changes" ? "var(--color-border)" : "transparent",
            borderBottom: activeTab === "changes" ? "2px solid var(--color-accent, #3b82f6)" : "none",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            color: activeTab === "changes" ? "var(--color-text)" : "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <ActivityIcon size={14} />
          <span>Timeline & Transitions ({changes.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {/* Network Environment Card */}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <GlobeIcon size={16} color="var(--color-accent, #3b82f6)" />
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text)" }}>
                      Active Network Environment Fingerprint
                    </span>
                  </div>
                  {summary?.network_identity && (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Confidence:</span>
                      {renderConfidenceBadge(summary.network_identity.confidence)}
                      <span
                        style={{
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          padding: "2px 6px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor:
                            summary.network_identity.trust_level === "TRUSTED"
                              ? "rgba(16, 185, 129, 0.15)"
                              : "var(--color-surface-elevated)",
                          color:
                            summary.network_identity.trust_level === "TRUSTED"
                              ? "#10b981"
                              : "var(--color-text-muted)",
                        }}
                      >
                        {summary.network_identity.trust_level}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    backgroundColor: "var(--color-surface-elevated)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Network ID:</span>
                    <div style={{ color: "var(--color-text)", fontWeight: "600" }}>
                      {summary?.network_identity?.network_id || "unknown"}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>SSID / Interface:</span>
                    <div style={{ color: "var(--color-text)", fontWeight: "600" }}>
                      {summary?.network_identity?.ssid || summary?.network_identity?.interface || "Local Interface"}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Gateway:</span>
                    <div style={{ color: "var(--color-text)" }}>
                      {summary?.network_identity?.gateway || "None detected"}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Local Addresses:</span>
                    <div style={{ color: "var(--color-text)" }}>
                      {summary?.network_identity?.local_addresses?.join(", ") || "127.0.0.1"}
                    </div>
                  </div>
                </div>

                {summary?.network_identity?.evidence && summary.network_identity.evidence.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Evidence Hierarchy:</span>
                    {summary.network_identity.evidence.map((ev, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          backgroundColor: "var(--color-surface-elevated)",
                          border: "1px solid var(--color-border)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-xs)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Metric Tallies Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {/* Devices Summary Card */}
                <div
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Subnet Devices</span>
                    <CpuIcon size={16} color="var(--color-text-muted)" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: "22px", fontWeight: "bold", color: "var(--color-text)" }}>
                      {summary?.device_count?.total ?? devices.length}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--color-success, #10b981)" }}>
                      ({summary?.device_count?.online ?? devices.filter((d) => d.status === "active").length} online)
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    {devices.filter((d) => d.classification !== "UNKNOWN").length} classified roles &middot;{" "}
                    {devices.filter((d) => d.classification === "UNKNOWN").length} unconfirmed
                  </div>
                </div>

                {/* Services Summary Card */}
                <div
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Local Service Catalog</span>
                    <ServerIcon size={16} color="var(--color-text-muted)" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: "22px", fontWeight: "bold", color: "var(--color-text)" }}>
                      {summary?.service_count?.total ?? services.length}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--color-success, #10b981)" }}>
                      ({summary?.service_count?.active ?? services.filter((s) => s.status === "ACTIVE").length} active)
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    {services.filter((s) => s.status === "TRANSIENT").length} transient &middot;{" "}
                    {services.filter((s) => s.status === "INACTIVE").length} inactive
                  </div>
                </div>

                {/* Active Processes Card */}
                <div
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Owning Processes</span>
                    <ActivityIcon size={16} color="var(--color-text-muted)" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: "22px", fontWeight: "bold", color: "var(--color-text)" }}>
                      {summary?.active_processes_count ?? new Set(services.map((s) => s.process_name)).size}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>unique listeners</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    Mapped via OS socket telemetry
                  </div>
                </div>
              </div>

              {/* Behavioral Insights & Recent Events */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "var(--space-4)",
                }}
              >
                {/* Insights Column */}
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
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text)" }}>
                    Synthesized Behavioral Observations
                  </span>
                  {(!summary?.insights || summary.insights.length === 0) ? (
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "var(--space-3) 0" }}>
                      No unusual behavioral surges or baseline deviations observed.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {summary.insights.map((ins, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "var(--space-2) var(--space-3)",
                            backgroundColor: "var(--color-surface-elevated)",
                            borderRadius: "var(--radius-sm)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontFamily: "var(--font-mono)",
                                fontWeight: "bold",
                                color: "var(--color-accent, #3b82f6)",
                              }}
                            >
                              {ins.insight_type}
                            </span>
                            {renderConfidenceBadge(ins.confidence)}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text)" }}>{ins.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Transitions Column */}
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
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text)" }}>
                    Recent Transitions (Last 5)
                  </span>
                  {changes.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "var(--space-3) 0" }}>
                      No recent network switches or device transitions logged.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {changes.slice(0, 5).map((ev, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "var(--space-2) var(--space-3)",
                            backgroundColor: "var(--color-surface-elevated)",
                            borderRadius: "var(--radius-sm)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontFamily: "var(--font-mono)",
                                fontWeight: "600",
                                color: "var(--color-text)",
                              }}
                            >
                              {ev.event_type}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {new Date(ev.timestamp * 1000).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: DEVICES */}
          {activeTab === "devices" && (
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
              {/* Device Filters */}
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: "220px" }}>
                  <SearchIcon size={14} color="var(--color-text-muted)" />
                  <input
                    type="text"
                    placeholder="Search by IP, hostname, vendor, MAC, alias..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "12px",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <select
                    value={deviceRoleFilter}
                    onChange={(e) => setDeviceRoleFilter(e.target.value)}
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="GATEWAY">GATEWAY</option>
                    <option value="ROUTER">ROUTER</option>
                    <option value="WORKSTATION">WORKSTATION</option>
                    <option value="LAPTOP">LAPTOP</option>
                    <option value="PHONE">PHONE</option>
                    <option value="TABLET">TABLET</option>
                    <option value="IOT">IOT</option>
                    <option value="PRINTER">PRINTER</option>
                    <option value="SERVER">SERVER</option>
                    <option value="NETWORK_INFRASTRUCTURE">INFRASTRUCTURE</option>
                    <option value="UNKNOWN">UNKNOWN</option>
                  </select>

                  <select
                    value={devicePresenceFilter}
                    onChange={(e) => setDevicePresenceFilter(e.target.value)}
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value="all">All Presence</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Devices Table */}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-text-muted)",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <th style={{ padding: "var(--space-2)" }}>Presence</th>
                      <th style={{ padding: "var(--space-2)" }}>Device / Alias</th>
                      <th style={{ padding: "var(--space-2)" }}>IP Address</th>
                      <th style={{ padding: "var(--space-2)" }}>MAC & Vendor</th>
                      <th style={{ padding: "var(--space-2)" }}>Classification</th>
                      <th style={{ padding: "var(--space-2)" }}>Confidence</th>
                      <th style={{ padding: "var(--space-2)" }}>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "var(--space-4)", color: "var(--color-text-muted)" }}>
                          No classified devices matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredDevices.map((d) => (
                        <tr
                          key={d.device_id}
                          onClick={() => networkIntelligenceStoreManager.selectDevice(d.device_id)}
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            cursor: "pointer",
                            backgroundColor:
                              selectedDeviceId === d.device_id
                                ? "var(--color-surface-elevated)"
                                : "transparent",
                          }}
                        >
                          <td style={{ padding: "var(--space-2)" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor:
                                  d.status === "active" || d.status === "reachable"
                                    ? "var(--color-success, #10b981)"
                                    : "var(--color-text-muted)",
                              }}
                            />
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <div style={{ fontWeight: "600", color: "var(--color-text)" }}>
                              {d.user_alias || d.hostname || "Unknown Host"}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                              {d.device_id}
                            </div>
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {d.ip_addresses[0] || "unknown"}
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            <div>{d.mac_address || "None"}</div>
                            <div style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{d.vendor || "Unknown Vendor"}</div>
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            {renderClassificationBadge(d.classification)}
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            {renderConfidenceBadge(d.confidence)}
                          </td>
                          <td style={{ padding: "var(--space-2)", fontSize: "11px", color: "var(--color-text-muted)" }}>
                            {d.evidence[0] || "Heuristic"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SERVICES */}
          {activeTab === "services" && (
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
              {/* Service Filters */}
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: "220px" }}>
                  <SearchIcon size={14} color="var(--color-text-muted)" />
                  <input
                    type="text"
                    placeholder="Search by process name, port, address, protocol..."
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "12px",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </div>

                <select
                  value={serviceStatusFilter}
                  onChange={(e) => setServiceStatusFilter(e.target.value)}
                  style={{
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRANSIENT">TRANSIENT</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              {/* Services Table */}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-text-muted)",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <th style={{ padding: "var(--space-2)" }}>State</th>
                      <th style={{ padding: "var(--space-2)" }}>Service / Name</th>
                      <th style={{ padding: "var(--space-2)" }}>Address : Port</th>
                      <th style={{ padding: "var(--space-2)" }}>Protocol</th>
                      <th style={{ padding: "var(--space-2)" }}>Owning Process</th>
                      <th style={{ padding: "var(--space-2)" }}>Lifetime</th>
                      <th style={{ padding: "var(--space-2)" }}>Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "var(--space-4)", color: "var(--color-text-muted)" }}>
                          No services matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((s) => (
                        <tr
                          key={s.service_id}
                          onClick={() => networkIntelligenceStoreManager.selectService(s.service_id)}
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            cursor: "pointer",
                            backgroundColor:
                              selectedServiceId === s.service_id
                                ? "var(--color-surface-elevated)"
                                : "transparent",
                          }}
                        >
                          <td style={{ padding: "var(--space-2)" }}>
                            {renderServiceStatusBadge(s.status)}
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <div style={{ fontWeight: "600", color: "var(--color-text)" }}>
                              {s.well_known_name || `Port ${s.port}`}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                              {s.service_id}
                            </div>
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {s.local_address}:{s.port}
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {s.protocol.toUpperCase()}
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {s.process_name} {s.pid ? `[${s.pid}]` : ""}
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {Math.round(s.lifetime_seconds)}s
                          </td>
                          <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                            {s.consecutive_observations} seen &middot; {s.missed_snapshots} missed
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CHANGES */}
          {activeTab === "changes" && (
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text)" }}>
                  Chronological Network Transition Ring Buffer
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Limit:</span>
                  <select
                    value={changesLimit}
                    onChange={(e) => {
                      const lim = Number(e.target.value);
                      setChangesLimit(lim);
                      networkIntelligenceStoreManager.refreshChanges(lim);
                    }}
                    style={{
                      padding: "2px 6px",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {changes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--color-text-muted)" }}>
                  No transitions recorded in the N9 ring buffer.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {changes.map((ch, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "var(--space-3)",
                        backgroundColor: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "var(--font-mono)",
                              fontWeight: "bold",
                              color: "var(--color-accent, #3b82f6)",
                            }}
                          >
                            {ch.event_type}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {new Date(ch.timestamp * 1000).toLocaleString()}
                        </span>
                      </div>

                      {ch.details && Object.keys(ch.details).length > 0 && (
                        <div
                          style={{
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--color-text-muted)",
                            backgroundColor: "var(--color-surface)",
                            padding: "var(--space-2)",
                            borderRadius: "var(--radius-xs)",
                            overflowX: "auto",
                          }}
                        >
                          {JSON.stringify(ch.details, null, 2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* INSPECTOR PANEL (Right Drawer) */}
        {(selectedDevice || selectedService) && (
          <div
            data-testid="network-intelligence-inspector"
            style={{
              width: "320px",
              flexShrink: 0,
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text)" }}>
                {selectedDevice ? "Device Inspector" : "Service Inspector"}
              </span>
              <button
                onClick={handleCloseInspector}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  padding: "2px",
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {/* Selected Device Details */}
            {selectedDevice && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Hostname / Alias:</span>
                  <div style={{ fontWeight: "600", color: "var(--color-text)" }}>
                    {selectedDevice.user_alias || selectedDevice.hostname || "Unknown Host"}
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Device ID:</span>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                    {selectedDevice.device_id}
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>IP Addresses:</span>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                    {selectedDevice.ip_addresses.join(", ")}
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>MAC & Vendor:</span>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                    {selectedDevice.mac_address || "N/A"} ({selectedDevice.vendor || "Unknown"})
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Classification:</span>
                    <div>{renderClassificationBadge(selectedDevice.classification)}</div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Confidence:</span>
                    <div>{renderConfidenceBadge(selectedDevice.confidence)}</div>
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Evidence Breakdown:</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                    {selectedDevice.evidence.map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          backgroundColor: "var(--color-surface-elevated)",
                          padding: "2px 4px",
                          borderRadius: "var(--radius-xs)",
                        }}
                      >
                        {ev}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)", marginTop: "var(--space-2)" }}>
                  <button
                    onClick={() => {
                      setActiveDomain("systems");
                      setActiveSidebarView("local_network");
                    }}
                    style={{
                      width: "100%",
                      padding: "var(--space-2)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    Inspect in Local Network Flows &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Selected Service Details */}
            {selectedService && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Service / Process:</span>
                  <div style={{ fontWeight: "600", color: "var(--color-text)" }}>
                    {selectedService.well_known_name || selectedService.process_name}
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Address : Port:</span>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                    {selectedService.local_address}:{selectedService.port} ({selectedService.protocol.toUpperCase()})
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Owning Process PID:</span>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                    {selectedService.process_name} {selectedService.pid ? `(PID ${selectedService.pid})` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Lifecycle State:</span>
                    <div>{renderServiceStatusBadge(selectedService.status)}</div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Lifetime:</span>
                    <div style={{ fontFamily: "var(--font-mono)" }}>
                      {Math.round(selectedService.lifetime_seconds)}s
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Observation History:</span>
                  <div
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      padding: "var(--space-2)",
                      borderRadius: "var(--radius-xs)",
                      marginTop: "2px",
                    }}
                  >
                    <div>{selectedService.consecutive_observations} consecutive cycles</div>
                    <div>{selectedService.missed_snapshots} missed snapshots</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)", marginTop: "var(--space-2)" }}>
                  <button
                    onClick={() => {
                      setActiveDomain("systems");
                      setActiveSidebarView("processes");
                    }}
                    style={{
                      width: "100%",
                      padding: "var(--space-2)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--color-text)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    Inspect Process in Systems &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
