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
