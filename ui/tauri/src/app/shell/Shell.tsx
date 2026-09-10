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
  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+P, Ctrl+B, Ctrl+`, Ctrl+Shift+I, Domain 1-8, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl+K or Cmd+K or Ctrl+P or Cmd+P: Toggle Command Palette
      if (isCtrlOrCmd && (key === "k" || key === "p") && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        uiStore.toggleCommandPalette();
        return;
      }

      // Ctrl+B / Cmd+B: Toggle Sidebar
      if (isCtrlOrCmd && key === "b" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        uiStore.toggleSidebar();
        return;
      }

      // Ctrl+` or Ctrl+J: Quick Terminal Jump
      if (isCtrlOrCmd && (e.key === "`" || key === "j") && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        uiStore.setActiveDomain("terminal");
        return;
      }

      // Ctrl+Shift+I or Ctrl+I: Toggle Inspector
      if (isCtrlOrCmd && key === "i") {
        e.preventDefault();
        e.stopPropagation();
        uiStore.toggleInspector();
        return;
      }

      // Ctrl+1 to Ctrl+8: Quick Domain Switching
      if (isCtrlOrCmd && !e.shiftKey && !e.altKey) {
        const domainMap: Record<string, "operations" | "chat" | "agents" | "guardian" | "systems" | "memory" | "terminal" | "settings"> = {
          "1": "operations",
          "2": "chat",
          "3": "agents",
          "4": "guardian",
          "5": "systems",
          "6": "memory",
          "7": "terminal",
          "8": "settings",
        };
        if (domainMap[e.key]) {
          e.preventDefault();
          e.stopPropagation();
          uiStore.setActiveDomain(domainMap[e.key]);
          return;
        }
      }

      // Escape: Close Command Palette or Inspector
      if (e.key === "Escape") {
        const state = uiStore.getState();
        if (state.commandPaletteOpen) {
          e.preventDefault();
          e.stopPropagation();
          uiStore.setCommandPaletteOpen(false);
        } else if (state.inspectorOpen) {
          e.preventDefault();
          e.stopPropagation();
          uiStore.setInspectorOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
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
