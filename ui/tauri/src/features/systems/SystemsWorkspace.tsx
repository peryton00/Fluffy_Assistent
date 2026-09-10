/**
 * Fluffy Desktop - Systems Workspace
 * 
 * Top-level view router for the Systems domain:
 * - Overview        -> Systems command center with aggregated metrics and health
 * - Processes       -> Process Explorer (Flat & Hierarchy trees with kill triggers)
 * - Applications    -> Installed apps manager with Base64 icons, launch, uninstall
 * - Startup         -> Startup & Persistence registry/folder entries manager
 * - Network         -> Distributed peer nodes, cluster roles, and remote telemetry
 * - Hardware        -> Engineering telemetry for CPU, RAM, Disks, and Network adapters
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { SystemsOverview } from "./views/SystemsOverview";
import { ProcessesView } from "./views/ProcessesView";
import { ApplicationsView } from "./views/ApplicationsView";
import { StartupView } from "./views/StartupView";
import { NetworkView } from "./views/NetworkView";
import { HardwareView } from "./views/HardwareView";

export const SystemsWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  const renderContent = () => {
    switch (activeSidebarView) {
      case "processes":
        return <ProcessesView />;
      case "apps":
        return <ApplicationsView />;
      case "startup":
        return <StartupView />;
      case "network":
        return <NetworkView />;
      case "hardware":
        return <HardwareView />;
      case "overview":
      default:
        return <SystemsOverview />;
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
