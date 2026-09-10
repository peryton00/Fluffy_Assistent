/**
 * Fluffy Desktop - Extensions Workspace
 * 
 * Top-level view router for the Extensions domain:
 * - Installed -> Extension registry, enable/disable toggle, reload, deletion
 * - Code      -> Safe code editor, hot-reload, test execution runner, VS Code launcher
 * - Web UIs   -> Embedded web interfaces served directly by Python Brain
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { InstalledView } from "./views/InstalledView";
import { CodeView } from "./views/CodeView";
import { WebUiView } from "./views/WebUiView";

export const ExtensionsWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  const renderContent = () => {
    switch (activeSidebarView) {
      case "code":
        return <CodeView />;
      case "web_ui":
        return <WebUiView />;
      case "installed":
      default:
        return <InstalledView />;
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
