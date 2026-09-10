/**
 * Fluffy Desktop - Analytics Workspace
 * 
 * Top-level view router for the Analytics domain:
 * - Resource Timeline -> Historical CPU, RAM, Disk, Network timeline trends
 * - Process Activity  -> Operational CPU and RAM breakdown across running processes
 * - Network Spikes    -> Anomaly detection and sudden traffic surges
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { ResourceTimelineView } from "./views/ResourceTimelineView";
import { ProcessActivityView } from "./views/ProcessActivityView";
import { NetworkSpikesView } from "./views/NetworkSpikesView";

export const AnalyticsWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  const renderContent = () => {
    switch (activeSidebarView) {
      case "activity":
        return <ProcessActivityView />;
      case "network_spikes":
        return <NetworkSpikesView />;
      case "timeline":
      default:
        return <ResourceTimelineView />;
    }
  };

  return (
    <div
      style={{
        flex: "1 1 0%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        backgroundColor: "var(--color-bg)",
        padding: "var(--space-4) var(--space-6)",
      }}
    >
      <div style={{ maxWidth: "1280px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {renderContent()}
      </div>
    </div>
  );
};
