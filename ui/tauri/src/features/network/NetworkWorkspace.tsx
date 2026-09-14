/**
 * Fluffy Desktop - Network Workspace
 * 
 * Phase N8: Network Operations Workspace Shell
 * Hosts the 7 Network subviews backed by the Rust N7 Network API and EventBus.
 * 
 * Subviews:
 * - Overview
 * - Systems
 * - Topology
 * - Traffic
 * - Events
 * - Security
 * - Interfaces
 */

import React, { useEffect } from "react";
import { useUiStore } from "../../stores/uiStore";
import { useNetworkWorkspaceStore, networkWorkspaceStore } from "../../stores/networkWorkspaceStore";
import { 
  NetworkOverview,
  NetworkSystemsView,
  NetworkTopologyView,
  NetworkTrafficView,
  NetworkEventsView,
  NetworkSecurityView,
  NetworkInterfacesView,
} from "./views";
import { 
  NetworkIcon, 
  RefreshCwIcon, 
  AlertCircleIcon, 
  CheckCircle2Icon, 
  ClockIcon,
  XIcon
} from "../../components/common/Icons";

export const NetworkWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView) || "overview";
  const status = useNetworkWorkspaceStore((s) => s.status);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);
  const revision = useNetworkWorkspaceStore((s) => s.revision);
  const error = useNetworkWorkspaceStore((s) => s.error);
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);

  // Initialize network API synchronization and event subscription on mount
  useEffect(() => {
    networkWorkspaceStore.initialize();
    return () => {
      networkWorkspaceStore.destroy();
    };
  }, []);

  const renderView = () => {
    switch (activeSidebarView) {
      case "overview":
        return <NetworkOverview />;
      case "systems":
        return <NetworkSystemsView />;
      case "topology":
        return <NetworkTopologyView />;
      case "traffic":
        return <NetworkTrafficView />;
      case "events":
        return <NetworkEventsView />;
      case "security":
        return <NetworkSecurityView />;
      case "interfaces":
        return <NetworkInterfacesView />;
      default:
        return <NetworkOverview />;
    }
  };

  const isDegradedOrStale = status === "degraded" || isStale;

  return (
    <div
      role="region"
      aria-label="Network Operations Workspace"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      {/* Network Header Banner */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-5)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-accent)",
            }}
          >
            <NetworkIcon size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h1
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                Network Operations
              </h1>
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>/</span>
              <span
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-secondary)",
                  textTransform: "capitalize",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {activeSidebarView}
              </span>
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                margin: 0,
                marginTop: "2px",
              }}
            >
              Rust-owned authoritative network runtime • N7 API & contracts
            </p>
          </div>
        </div>

        {/* Sync Status / Diagnostics / Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {/* Selected Entity Chip */}
          {selectedEntity && selectedEntity.type !== "none" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "2px 8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-accent-subtle)",
                border: "1px solid var(--color-accent)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--color-accent)",
              }}
            >
              <span>Selected: {selectedEntity.type}:{selectedEntity.id}</span>
              <button
                type="button"
                onClick={() => networkWorkspaceStore.clearSelection()}
                title="Clear selection"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--color-accent)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          )}

          {/* Sync State Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              backgroundColor:
                status === "healthy"
                  ? "var(--color-surface-elevated)"
                  : isDegradedOrStale
                  ? "rgba(234, 179, 8, 0.12)"
                  : status === "error"
                  ? "rgba(239, 68, 68, 0.12)"
                  : "var(--color-surface-subtle)",
              border: `1px solid ${
                status === "healthy"
                  ? "var(--color-border)"
                  : isDegradedOrStale
                  ? "var(--color-warning)"
                  : status === "error"
                  ? "var(--color-danger)"
                  : "var(--color-border)"
              }`,
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {status === "healthy" ? (
              <CheckCircle2Icon size={12} style={{ color: "var(--color-success)" }} />
            ) : isDegradedOrStale ? (
              <ClockIcon size={12} style={{ color: "var(--color-warning)" }} />
            ) : status === "error" ? (
              <AlertCircleIcon size={12} style={{ color: "var(--color-danger)" }} />
            ) : (
              <RefreshCwIcon size={12} style={{ color: "var(--color-accent)" }} />
            )}
            <span
              style={{
                color:
                  status === "healthy"
                    ? "var(--color-text-secondary)"
                    : isDegradedOrStale
                    ? "var(--color-warning)"
                    : status === "error"
                    ? "var(--color-danger)"
                    : "var(--color-text-muted)",
                fontWeight: "var(--font-weight-medium)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {status}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>•</span>
            <span style={{ color: "var(--color-text-muted)" }}>r{revision}</span>
          </div>

          {/* Resync Button */}
          <button
            type="button"
            onClick={() => networkWorkspaceStore.resync()}
            title="Force snapshot resync from Rust Network Subsystem"
            disabled={status === "loading"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "4px 10px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            <RefreshCwIcon size={12} />
            <span>Resync</span>
          </button>
        </div>
      </header>

      {/* Degraded / Lag / Error Banner if active */}
      {isDegradedOrStale && (
        <div
          style={{
            backgroundColor: "rgba(234, 179, 8, 0.15)",
            borderBottom: "1px solid var(--color-warning)",
            padding: "var(--space-2) var(--space-5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--color-warning)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <AlertCircleIcon size={14} />
            <span>
              <strong>Event Lag Detected:</strong> Network event bus lag threshold exceeded. Re-synchronizing authoritative snapshot from Rust backend...
            </span>
          </div>
          <button
            type="button"
            onClick={() => networkWorkspaceStore.resync()}
            style={{
              background: "none",
              border: "1px solid var(--color-warning)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-warning)",
              padding: "2px 8px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Retry Now
          </button>
        </div>
      )}

      {status === "error" && error && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            borderBottom: "1px solid var(--color-danger)",
            padding: "var(--space-2) var(--space-5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--color-danger)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <AlertCircleIcon size={14} />
            <span>
              <strong>Network API Sync Error:</strong> {error.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => networkWorkspaceStore.resync()}
            style={{
              background: "none",
              border: "1px solid var(--color-danger)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-danger)",
              padding: "2px 8px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Resync
          </button>
        </div>
      )}

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "var(--space-4)",
          }}
        >
          {renderView()}
        </main>
      </div>
  );
};
