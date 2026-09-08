/**
 * Fluffy Desktop - Operations Workspace
 * 
 * Top-level view router for the Operations domain:
 * - Overview        -> System telemetry, subsystem health, approvals, activity feed
 * - Quick Actions   -> System normalization, speed benchmark, navigation
 * - Telemetry       -> Multi-core CPU, memory, disks, network inspection
 * - Live Logs       -> Real-time streaming log terminal (5s cadence)
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { OperationsOverview } from "./views/OperationsOverview";
import { QuickActionsView } from "./views/QuickActionsView";
import { ActiveTelemetryView } from "./views/ActiveTelemetryView";
import { LiveLogsView } from "./views/LiveLogsView";

export const OperationsWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  switch (activeSidebarView) {
    case "quick_actions":
      return <QuickActionsView />;
    case "telemetry":
      return <ActiveTelemetryView />;
    case "logs":
      return <LiveLogsView />;
    case "overview":
    default:
      return <OperationsOverview />;
  }
};
