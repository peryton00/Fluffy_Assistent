/**
 * Fluffy Desktop - Command Palette Modal (Ctrl+K)
 * 
 * Accessible command & search modal allowing quick domain / view navigation
 * and direct operational action execution.
 * Controlled by uiStore.commandPaletteOpen.
 */

import React, { useState, useEffect, useRef } from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import { telemetryCoordinator } from "../../stores/telemetryStore";
import { logsCoordinator } from "../../stores/logsStore";
import { normalizeSystem, runSpeedTest } from "../../services/api/operations";
import { DOMAIN_DEFINITIONS, type ActiveDomain } from "../../types/ui";
import { SearchIcon, CloseIcon, getDomainIcon, ZapIcon, WifiIcon, RefreshCwIcon, TerminalIcon, GridIcon, ServerIcon, LayersIcon, ShieldCheckIcon as ShieldIcon, TrashIcon, PuzzleIcon, BarChartIcon, SettingsIcon, BrainIcon } from "../../components/common/Icons";
import { appsStore } from "../../stores/appsStore";
import { terminalStore } from "../../stores/terminalStore";
import { extensionsStore } from "../../stores/extensionsStore";

interface ActionItem {
  id: string;
  type: "navigation" | "action";
  label: string;
  sublabel: string;
  badge: string;
  icon: React.ReactNode;
  execute: () => void | Promise<void>;
}

export const CommandPalette: React.FC = () => {
  const isOpen = useUiStore((s) => s.commandPaletteOpen);
  const [query, setQuery] = useState("");
  const [executingId, setExecutingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const allItems: ActionItem[] = [
    // Operational Actions
    {
      id: "action-normalize",
      type: "action",
      label: "Normalize Host System",
      sublabel: "Clean temporary files and reset baselines (POST /normalize)",
      badge: "Action",
      icon: <ZapIcon size={14} />,
      execute: async () => {
        setExecutingId("action-normalize");
        try {
          await normalizeSystem();
          await Promise.all([telemetryCoordinator.refreshNow(), logsCoordinator.refreshNow()]);
        } finally {
          setExecutingId(null);
          uiStore.setCommandPaletteOpen(false);
        }
      },
    },
    {
      id: "action-speedtest",
      type: "action",
      label: "Run Network Speed Test",
      sublabel: "Measure download bandwidth and ping (POST /net-speed)",
      badge: "Action",
      icon: <WifiIcon size={14} />,
      execute: async () => {
        setExecutingId("action-speedtest");
        try {
          await runSpeedTest();
          await logsCoordinator.refreshNow();
        } finally {
          setExecutingId(null);
          uiStore.setCommandPaletteOpen(false);
        }
      },
    },
    {
      id: "action-apps-refresh",
      type: "action",
      label: "Deep Scan Registry Applications",
      sublabel: "Rescan installed desktop applications from Windows registry (POST /apps/refresh)",
      badge: "Action",
      icon: <GridIcon size={14} />,
      execute: async () => {
        setExecutingId("action-apps-refresh");
        try {
          await appsStore.refreshDeep();
          uiStore.setActiveDomain("systems");
          uiStore.setActiveSidebarView("apps");
        } finally {
          setExecutingId(null);
          uiStore.setCommandPaletteOpen(false);
        }
      },
    },
    {
      id: "action-refresh-telemetry",
      type: "action",
      label: "Refresh System Status",
      sublabel: "Perform an immediate GET /status telemetry sync",
      badge: "Action",
      icon: <RefreshCwIcon size={14} />,
      execute: async () => {
        await telemetryCoordinator.refreshNow();
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-processes",
      type: "action",
      label: "Open Process Explorer",
      sublabel: "Inspect active processes, CPU/RAM consumers, and hierarchy trees",
      badge: "View",
      icon: <LayersIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("systems");
        uiStore.setActiveSidebarView("processes");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-network",
      type: "action",
      label: "Distributed LAN & Mesh Network",
      sublabel: "Inspect peer nodes, cluster roles, and remote telemetry",
      badge: "View",
      icon: <ServerIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("systems");
        uiStore.setActiveSidebarView("network");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-logs",
      type: "action",
      label: "View Live Logs Stream",
      sublabel: "Switch to real-time operations log journal",
      badge: "View",
      icon: <TerminalIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("operations");
        uiStore.setActiveSidebarView("logs");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-approvals",
      type: "action",
      label: "Guardian Authorization Queue",
      sublabel: "Review pending privileged operations and elevated command authorizations",
      badge: "Security",
      icon: <ShieldIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("guardian");
        uiStore.selectGuardianSection("approvals");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-trusted",
      type: "action",
      label: "Guardian Process Whitelist",
      sublabel: "Manage trusted binaries and autonomous policy bypass rules",
      badge: "Security",
      icon: <ShieldIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("guardian");
        uiStore.selectGuardianSection("trusted");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-memory-profile",
      type: "action",
      label: "Long-Term Memory Profile",
      sublabel: "Inspect and update learned behavioral facts and operator identity",
      badge: "Memory",
      icon: <ZapIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("memory");
        uiStore.selectMemorySection("profile");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-view-memory-preferences",
      type: "action",
      label: "Memory Preferences Store",
      sublabel: "Review and update runtime key-value behavioral flags",
      badge: "Memory",
      icon: <GridIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("memory");
        uiStore.selectMemorySection("preferences");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-terminal-console",
      type: "action",
      label: "Open Local Console",
      sublabel: "Launch interactive Core REPL terminal (ws://127.0.0.1:9003)",
      badge: "Terminal",
      icon: <TerminalIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("terminal");
        uiStore.selectTerminalSection("console");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-terminal-nodes",
      type: "action",
      label: "Open Agent Nodes",
      sublabel: "Manage connected distributed client agents and active target routing",
      badge: "Terminal",
      icon: <ServerIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("terminal");
        uiStore.selectTerminalSection("nodes");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-terminal-reconnect",
      type: "action",
      label: "Reconnect Core Terminal",
      sublabel: "Reset and re-establish full-duplex WebSocket stream to port 9003",
      badge: "Terminal",
      icon: <RefreshCwIcon size={14} />,
      execute: () => {
        terminalStore.reconnect();
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-terminal-clear",
      type: "action",
      label: "Clear Terminal Buffer",
      sublabel: "Clear local terminal output lines buffer",
      badge: "Terminal",
      icon: <TrashIcon size={14} />,
      execute: () => {
        terminalStore.clearOutput();
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-chat-conversation",
      type: "action",
      label: "Open Chat Conversation",
      sublabel: "Launch live conversational assistant interface with local streaming LLM",
      badge: "Chat",
      icon: <TerminalIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("chat");
        uiStore.selectChatSection("conversation");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-chat-new-session",
      type: "action",
      label: "New Chat Session",
      sublabel: "Create a fresh conversational context in Python Brain",
      badge: "Chat",
      icon: <ZapIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("chat");
        uiStore.selectChatSection("conversation");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-chat-sessions",
      type: "action",
      label: "Open Chat Sessions",
      sublabel: "Browse past chat transcripts and session history",
      badge: "Chat",
      icon: <LayersIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("chat");
        uiStore.selectChatSection("sessions");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-chat-context",
      type: "action",
      label: "Open Chat Context Inspector",
      sublabel: "Inspect active Brain runtime context, memory facts, and Guardian policy state",
      badge: "Chat",
      icon: <ServerIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("chat");
        uiStore.selectChatSection("context");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-chat-voice",
      type: "action",
      label: "Open Voice & Audio Controls",
      sublabel: "Configure Vosk STT speech recognition and pyttsx3 TTS voice synthesis",
      badge: "Voice",
      icon: <WifiIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("chat");
        uiStore.selectChatSection("voice");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-extensions-refresh",
      type: "action",
      label: "Refresh Installed Extensions",
      sublabel: "Rescan custom Python extensions and plugins from disk (GET /extensions)",
      badge: "Extensions",
      icon: <PuzzleIcon size={14} />,
      execute: async () => {
        setExecutingId("action-extensions-refresh");
        try {
          await extensionsStore.loadExtensions(true);
          uiStore.setActiveDomain("extensions");
          uiStore.setActiveSidebarView("installed");
        } finally {
          setExecutingId(null);
          uiStore.setCommandPaletteOpen(false);
        }
      },
    },
    {
      id: "action-analytics-timeline",
      type: "action",
      label: "Open Resource Timeline",
      sublabel: "Inspect real-time rolling telemetry graphs for CPU, RAM, and Network",
      badge: "Analytics",
      icon: <BarChartIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("analytics");
        uiStore.setActiveSidebarView("timeline");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-analytics-spikes",
      type: "action",
      label: "Inspect Network Spikes",
      sublabel: "View traffic surge anomalies and bandwidth burst log",
      badge: "Analytics",
      icon: <ZapIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("analytics");
        uiStore.setActiveSidebarView("network_spikes");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-settings-appearance",
      type: "action",
      label: "Configure Theme & Appearance",
      sublabel: "Switch between Fluffy Dark, Fluffy Light, and High Contrast palettes",
      badge: "Settings",
      icon: <SettingsIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("settings");
        uiStore.setActiveSidebarView("appearance");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-settings-models",
      type: "action",
      label: "Configure OpenRouter / LLM Models",
      sublabel: "Update OpenRouter API credentials and primary model routing target",
      badge: "Settings",
      icon: <BrainIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("settings");
        uiStore.setActiveSidebarView("models");
        uiStore.setCommandPaletteOpen(false);
      },
    },
    {
      id: "action-settings-ftp",
      type: "action",
      label: "Open FTP Server Controls",
      sublabel: "Start/Stop local port 2121 file transfer bridge and view clients",
      badge: "Settings",
      icon: <ServerIcon size={14} />,
      execute: () => {
        uiStore.setActiveDomain("settings");
        uiStore.setActiveSidebarView("ftp");
        uiStore.setCommandPaletteOpen(false);
      },
    },
  ];

  // Populate Domain / Navigation views
  (Object.keys(DOMAIN_DEFINITIONS) as ActiveDomain[]).forEach((domainId) => {
    const domain = DOMAIN_DEFINITIONS[domainId];
    domain.views.forEach((view) => {
      allItems.push({
        id: `nav-${domainId}-${view.id}`,
        type: "navigation",
        label: `${domain.label} / ${view.label}`,
        sublabel: domain.description,
        badge: "Jump",
        icon: getDomainIcon(domainId, { size: 14 }),
        execute: () => {
          uiStore.setActiveDomain(domainId);
          uiStore.setActiveSidebarView(view.id);
          uiStore.setCommandPaletteOpen(false);
        },
      });
    });
  });

  const filteredItems = query.trim() === ""
    ? allItems.slice(0, 10)
    : allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sublabel.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 12);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={() => uiStore.setCommandPaletteOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "var(--space-3) var(--space-4)",
            borderBottom: "1px solid var(--color-border)",
            gap: "var(--space-3)",
          }}
        >
          <SearchIcon size={16} style={{ color: "var(--color-text-muted)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, action, or workspace view..."
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "none",
              padding: 0,
              fontSize: "var(--font-size-sm)",
              color: "var(--color-text)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => uiStore.setCommandPaletteOpen(false)}
            aria-label="Close Command Palette"
            style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Filtered Results */}
        <div
          role="listbox"
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            padding: "var(--space-2)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ padding: "var(--space-4)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              No matching commands or actions found
            </div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                disabled={executingId === item.id}
                onClick={() => item.execute()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text)",
                  textAlign: "left",
                  cursor: executingId === item.id ? "not-allowed" : "pointer",
                  transition: "background-color var(--transition-fast)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <span style={{ color: "var(--color-accent)", display: "flex" }}>
                    {item.icon}
                  </span>
                  <div>
                    <span style={{ fontWeight: "var(--font-weight-medium)" }}>{item.label}</span>
                    <p style={{ fontSize: "10px", color: "var(--color-text-muted)", margin: "1px 0 0 0" }}>
                      {item.sublabel}
                    </p>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: "var(--font-weight-bold)",
                    color: item.type === "action" ? "var(--color-accent)" : "var(--color-text-muted)",
                    backgroundColor: "var(--color-surface-elevated)",
                    padding: "1px 5px",
                    borderRadius: "2px",
                    border: "1px solid var(--color-border-subtle)",
                    textTransform: "uppercase",
                  }}
                >
                  {executingId === item.id ? "Running..." : item.badge}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-2) var(--space-4)",
            borderTop: "1px solid var(--color-border-subtle)",
            backgroundColor: "var(--color-surface-subtle)",
            fontSize: "10px",
            color: "var(--color-text-muted)",
          }}
        >
          <span>Use <code>↑</code> <code>↓</code> to navigate, <code>Enter</code> to select</span>
          <span><code>Esc</code> to close</span>
        </div>
      </div>
    </div>
  );
};
