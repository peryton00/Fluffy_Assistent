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

  if (activeSidebarView === "code") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <CodeView />
      </div>
    );
  }

  if (activeSidebarView === "web_ui") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <WebUiView />
      </div>
    );
  }

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
        <InstalledView />
      </div>
    </div>
  );
};
