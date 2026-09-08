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
