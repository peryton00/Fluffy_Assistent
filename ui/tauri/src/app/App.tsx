/**
 * Fluffy Desktop - Root Application Component
 * 
 * Manages foundation bootstrap:
 * 1. Initializes central telemetry coordinator
 * 2. Binds active theme to the document root
 * 3. Renders the operational UI foundation
 */

import React, { useEffect } from "react";
import { telemetryCoordinator } from "../stores/telemetryStore";
import { useUiStore } from "../stores/uiStore";
import { applyTheme } from "../themes";
import { Shell } from "./shell/Shell";
import "../styles/base.css";

export const App: React.FC = () => {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    // Apply initial theme
    applyTheme(theme);

    // Start single centralized telemetry coordinator
    telemetryCoordinator.start();

    return () => {
      // Clean up polling coordinator when App unmounts
      telemetryCoordinator.stop();
    };
  }, []);

  return <Shell />;
};
