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

  const renderContent = () => {
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
