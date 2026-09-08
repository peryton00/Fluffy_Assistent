/**
 * Fluffy Desktop - Application Shell
 * 
 * Persistent master workbench layout coordinating:
 * - TopBar
 * - ActivityBar
 * - ContextualSidebar
 * - Workspace
 * - Inspector
 * - StatusBar
 * - CommandPalette (Ctrl+K)
 */

import React, { useEffect } from "react";
import { uiStore } from "../../stores/uiStore";
import { TopBar } from "./TopBar";
import { ActivityBar } from "./ActivityBar";
import { ContextualSidebar } from "./ContextualSidebar";
import { Workspace } from "./Workspace";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";

export const Shell: React.FC = () => {
  // Global Keyboard Shortcuts (Ctrl+K, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K: Toggle Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        uiStore.toggleCommandPalette();
      }

      // Escape: Close Command Palette or Inspector
      if (e.key === "Escape") {
        const state = uiStore.getState();
        if (state.commandPaletteOpen) {
          e.preventDefault();
          uiStore.setCommandPaletteOpen(false);
        } else if (state.inspectorOpen) {
          e.preventDefault();
          uiStore.setInspectorOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "var(--topbar-height) 1fr var(--statusbar-height)",
        gridTemplateColumns: "1fr",
        width: "100vw",
        height: "100vh",
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 1. Persistent Top Bar */}
      <TopBar />

      {/* 2. Main Work Area (ActivityBar + Sidebar + Workspace + Inspector) */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Primary Navigation Activity Bar */}
        <ActivityBar />

        {/* Dynamic Contextual Sidebar */}
        <ContextualSidebar />

        {/* Active Workspace */}
        <Workspace />

        {/* Contextual Inspector */}
        <Inspector />
      </div>

      {/* 3. Persistent Status Bar */}
      <StatusBar />

      {/* 4. Global Command Palette Modal */}
      <CommandPalette />
    </div>
  );
};
