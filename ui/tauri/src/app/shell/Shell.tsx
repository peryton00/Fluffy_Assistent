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

import React, { useState, useEffect } from "react";
import { uiStore, useUiStore } from "../../stores/uiStore";
import { TopBar } from "./TopBar";
import { ActivityBar } from "./ActivityBar";
import { ContextualSidebar } from "./ContextualSidebar";
import { Workspace } from "./Workspace";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";

export const Shell: React.FC = () => {
  const theme = useUiStore((s) => s.theme);
  const [wallpaperDataUrl, setWallpaperDataUrl] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Fetch System Wallpaper via Tauri Rust bridge
  useEffect(() => {
    let isMounted = true;
    const loadWallpaper = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const base64Uri = await invoke<string>("get_system_wallpaper");
        if (isMounted && base64Uri && base64Uri.length > 0) {
          setWallpaperDataUrl(base64Uri);
        }
      } catch (err) {
        // Non-Tauri or unavailable wallpaper
        console.debug("Wallpaper fetch skipped or unsupported:", err);
      }
    };

    loadWallpaper();
    return () => {
      isMounted = false;
    };
  }, []);

  // Monitor Window State (Maximized / Fullscreen vs Small Floating Window)
  useEffect(() => {
    let unlistenResize: (() => void) | null = null;
    let isMounted = true;

    const setupWindowStateListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        
        const checkMaximized = async () => {
          if (!isMounted) return;
          try {
            const isMax = await appWindow.isMaximized();
            const isFull = await appWindow.isFullscreen();
            setIsMaximized(isMax || isFull);
          } catch {
            const isMaxFallback = 
              window.innerWidth >= (window.screen.availWidth - 20) && 
              window.innerHeight >= (window.screen.availHeight - 20);
            setIsMaximized(isMaxFallback);
          }
        };

        await checkMaximized();
        unlistenResize = await appWindow.onResized(() => {
          checkMaximized();
        });
      } catch {
        // Standard Web fallback
        const handleWindowResize = () => {
          const isMaxFallback = 
            window.innerWidth >= (window.screen.availWidth - 20) && 
            window.innerHeight >= (window.screen.availHeight - 20);
          setIsMaximized(isMaxFallback);
        };
        handleWindowResize();
        window.addEventListener("resize", handleWindowResize);
        unlistenResize = () => window.removeEventListener("resize", handleWindowResize);
      }
    };

    setupWindowStateListener();

    return () => {
      isMounted = false;
      if (unlistenResize) unlistenResize();
    };
  }, []);

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

  const isTransparentTheme = theme === "transparent";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "var(--topbar-height) 1fr var(--statusbar-height)",
        gridTemplateColumns: "1fr",
        width: "100vw",
        height: "100vh",
        backgroundColor: isTransparentTheme ? "transparent" : "var(--color-bg)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Dynamic Aero Glass & System Wallpaper Layer */}
      {isTransparentTheme && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
            transition: "all 300ms ease-in-out",
          }}
        >
          {/* Fullscreen / Maximized Mode Backdrop */}
          {isMaximized ? (
            wallpaperDataUrl ? (
              <>
                {/* Desktop Wallpaper Image */}
                <div
                  style={{
                    position: "absolute",
                    inset: "-20px",
                    backgroundImage: `url(${wallpaperDataUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "brightness(0.68) saturate(1.25) blur(12px)",
                    transform: "scale(1.04)",
                    transition: "opacity 400ms ease",
                  }}
                />
                {/* Frosted Glass Dark Vignette & Specular Gradient */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 70%), linear-gradient(180deg, rgba(10, 15, 24, 0.65) 0%, rgba(8, 12, 20, 0.85) 100%)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  }}
                />
              </>
            ) : (
              /* Universal Procedural Mesh Wallpaper Fallback for Linux/macOS/Web when raw wallpaper is unexposed */
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 80% 60% at 20% 20%, rgba(56, 189, 248, 0.18) 0%, transparent 60%), radial-gradient(ellipse 70% 70% at 80% 80%, rgba(129, 140, 248, 0.18) 0%, transparent 60%), radial-gradient(circle at 50% 50%, rgba(16, 229, 154, 0.08) 0%, transparent 60%), #080c14",
                  backdropFilter: "blur(24px) saturate(180%)",
                  WebkitBackdropFilter: "blur(24px) saturate(180%)",
                }}
              />
            )
          ) : (
            /* Windowed / Small Screen Glass Overlay (shows live desktop/windows through transparent window) */
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(135deg, rgba(15, 23, 38, 0.55) 0%, rgba(10, 15, 24, 0.72) 100%)",
                backdropFilter: "blur(22px) saturate(160%)",
                WebkitBackdropFilter: "blur(22px) saturate(160%)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
              }}
            />
          )}
        </div>
      )}

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
          zIndex: 1,
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

