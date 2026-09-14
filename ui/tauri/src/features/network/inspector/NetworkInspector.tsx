/**
 * Fluffy Desktop - Unified Network Inspector (Phase N11)
 * 
 * Unified, read-only Inspector panel for Nodes, Devices, Connections, Interfaces,
 * and derived External Endpoints.
 * 
 * Architectural Invariants:
 * - Pure read-only projection of authoritative networkWorkspaceStore state.
 * - Resolves live entity data from current store on every render.
 * - Distinguishes entity state (e.g. Disconnected) from entity existence (Entity Removed).
 * - Distinguishes workspace synchronization state (stale/degraded) from entity state.
 * - Zero Emojis, zero additional polling/event subscriptions.
 */

import React from "react";
import {
  useNetworkWorkspaceStore,
  networkWorkspaceStore,
} from "../../../stores/networkWorkspaceStore";
import {
  resolveSelectedEntity,
  resolveAssociatedConnections,
  resolveRelatedEvents,
} from "./inspectorModel";
import { NodeInspectorSection } from "./NodeInspectorSection";
import { DeviceInspectorSection } from "./DeviceInspectorSection";
import { ConnectionInspectorSection } from "./ConnectionInspectorSection";
import { InterfaceInspectorSection } from "./InterfaceInspectorSection";
import { ExternalEndpointInspectorSection } from "./ExternalEndpointInspectorSection";
import {
  CloseIcon,
  CpuIcon,
  WifiIcon,
  ActivityIcon,
  LayersIcon,
  GlobeIcon,
  AlertCircleIcon,
  ClockIcon,
} from "../../../components/common/Icons";

export const NetworkInspector: React.FC = () => {
  const selectedEntity = useNetworkWorkspaceStore((s) => s.selectedEntity);
  const nodes = useNetworkWorkspaceStore((s) => s.nodes);
  const devices = useNetworkWorkspaceStore((s) => s.devices);
  const connections = useNetworkWorkspaceStore((s) => s.connections);
  const interfaces = useNetworkWorkspaceStore((s) => s.interfaces);
  const events = useNetworkWorkspaceStore((s) => s.events);
  const isStale = useNetworkWorkspaceStore((s) => s.isStale);

  if (!selectedEntity || selectedEntity.type === "none" || !selectedEntity.id) {
    return null;
  }

  const resolved = resolveSelectedEntity(selectedEntity, {
    nodes,
    devices,
    connections,
    interfaces,
  });

  const associatedConnections = resolveAssociatedConnections(
    selectedEntity,
    connections,
    nodes,
    devices
  );

  const relatedEvents = resolveRelatedEvents(selectedEntity, events);

  const handleClose = () => {
    networkWorkspaceStore.clearSelection();
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "node":
        return <CpuIcon size={16} style={{ color: "var(--color-accent)" }} />;
      case "device":
        return <WifiIcon size={16} style={{ color: "var(--color-success)" }} />;
      case "connection":
        return <ActivityIcon size={16} style={{ color: "var(--color-info, #3b82f6)" }} />;
      case "interface":
        return <LayersIcon size={16} style={{ color: "var(--color-warning, #eab308)" }} />;
      case "external_endpoint":
        return <GlobeIcon size={16} style={{ color: "var(--color-accent-purple, #a855f7)" }} />;
      default:
        return <AlertCircleIcon size={16} style={{ color: "var(--color-text-muted)" }} />;
    }
  };

  const getEntityTitle = () => {
    if (!resolved) {
      return selectedEntity.id;
    }
    switch (resolved.type) {
      case "node":
        return resolved.data.name;
      case "device":
        return resolved.data.hostname || resolved.data.ip_address;
      case "connection":
        return `${resolved.data.protocol.toUpperCase()} Flow :${resolved.data.local_port}`;
      case "interface":
        return resolved.data.name;
      case "external_endpoint":
        return `Target ${resolved.data.remoteAddress}`;
    }
  };

  return (
    <aside
      aria-label="Network Entity Inspector"
      style={{
        width: "340px",
        minWidth: "300px",
        maxWidth: "420px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Inspector Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface-elevated)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", overflow: "hidden" }}>
          {getEntityIcon(selectedEntity.type)}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "var(--font-weight-bold)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {getEntityTitle()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                {selectedEntity.type.replace(/_/g, " ").toUpperCase()}
              </span>
              {isStale && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                    fontSize: "9px",
                    color: "var(--color-warning)",
                    backgroundColor: "rgba(234, 179, 8, 0.12)",
                    padding: "1px 4px",
                    borderRadius: "var(--radius-xs)",
                  }}
                >
                  <ClockIcon size={9} />
                  <span>Stale Sync</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close Inspector"
          title="Deselect entity (Esc)"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "var(--radius-xs)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Inspector Body Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
        }}
      >
        {resolved ? (
          <>
            {resolved.type === "node" && (
              <NodeInspectorSection
                node={resolved.data}
                associatedConnections={associatedConnections}
                relatedEvents={relatedEvents}
              />
            )}
            {resolved.type === "device" && (
              <DeviceInspectorSection
                device={resolved.data}
                associatedConnections={associatedConnections}
                relatedEvents={relatedEvents}
              />
            )}
            {resolved.type === "connection" && (
              <ConnectionInspectorSection
                connection={resolved.data}
                relatedEvents={relatedEvents}
              />
            )}
            {resolved.type === "interface" && (
              <InterfaceInspectorSection
                iface={resolved.data}
                relatedEvents={relatedEvents}
              />
            )}
            {resolved.type === "external_endpoint" && (
              <ExternalEndpointInspectorSection
                endpoint={resolved.data}
                relatedEvents={relatedEvents}
              />
            )}
          </>
        ) : (
          /* Entity Unavailable / Removed State */
          <div
            style={{
              padding: "var(--space-6) var(--space-4)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
              backgroundColor: "rgba(239, 68, 68, 0.05)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              margin: "var(--space-2) 0",
            }}
          >
            <AlertCircleIcon size={28} style={{ color: "var(--color-warning)" }} />
            <div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", fontWeight: "var(--font-weight-semibold)" }}>
                Entity Unavailable
              </h4>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-muted)" }}>
                The selected {selectedEntity.type.replace(/_/g, " ")} is no longer present in the current authoritative network state snapshot.
              </p>
              <div style={{ marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-text-secondary)" }}>
                ID: {selectedEntity.id}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              style={{
                marginTop: "var(--space-2)",
                padding: "4px 12px",
                fontSize: "11px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
