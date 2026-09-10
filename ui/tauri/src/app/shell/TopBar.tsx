/**
 * Fluffy Desktop - Shell TopBar
 * 
 * Persistent top bar providing:
 * 1. Brand identity with local Fluffy logo
 * 2. Interactive Command / Search trigger (Ctrl+K)
 * 3. System & backend status indicator (consuming telemetryStore)
 * 4. Quick toggles (Theme, Inspector)
 */

import React, { useState, useRef } from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import { useTelemetryStore } from "../../stores/telemetryStore";
import { SearchIcon, SunIcon, MoonIcon, PanelRightIcon, BellIcon } from "../../components/common/Icons";
import { NotificationPopover } from "./NotificationPopover";
import type { ConnectionState, ThemeMode } from "../../types/ui";

export const TopBar: React.FC = () => {
  const theme = useUiStore((s) => s.theme);
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const { connectionState, loading, snapshot } = useTelemetryStore();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  const pendingApprovalsCount = snapshot?.pending_confirmations?.length || 0;
  const securityAlertsCount = snapshot?.security_alerts?.length || 0;
  const notificationsCount = snapshot?.notifications?.length || 0;
  const totalNotifications = pendingApprovalsCount + securityAlertsCount + notificationsCount;

  const handleNextTheme = () => {
    const cycle: Record<ThemeMode, ThemeMode> = {
      fluffyDark: "fluffyLight",
      fluffyLight: "highContrast",
      highContrast: "fluffyDark",
      custom: "fluffyDark",
    };
    uiStore.setTheme(cycle[theme]);
  };

  const getConnectionDotColor = (state: ConnectionState): string => {
    switch (state) {
      case "CONNECTED": return "var(--color-success)";
      case "CONNECTING": return "var(--color-accent)";
      case "AUTHENTICATION_FAILED":
      case "BACKEND_UNAVAILABLE": return "var(--color-danger)";
      case "STALE":
      case "REQUEST_FAILED": return "var(--color-warning)";
      default: return "var(--color-text-muted)";
    }
  };

  return (
    <header
      role="banner"
      style={{
        position: "relative",
        height: "var(--topbar-height)",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-4)",
        zIndex: 50,
        flexShrink: 0,
        gap: "var(--space-4)",
      }}
    >
      {/* Left: Brand Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: "180px" }}>
        <img
          src="/logo.png"
          alt="Fluffy Logo"
          style={{ width: "22px", height: "22px", borderRadius: "var(--radius-xs)" }}
          onError={(e) => {
            // Graceful fallback if image is loading
            (e.target as HTMLElement).style.display = "none";
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-md)", letterSpacing: "var(--letter-spacing-tight)" }}>
            FLUFFY
          </span>
          <span
            style={{
              fontSize: "var(--font-size-2xs)",
              fontWeight: "var(--font-weight-semibold)",
              textTransform: "uppercase",
              padding: "1px 4px",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border-subtle)",
              color: "var(--color-text-muted)",
            }}
          >
            Workbench
          </span>
        </div>
      </div>

      {/* Center: Interactive Command / Search Palette Trigger */}
      <div style={{ flex: "1 1 auto", maxWidth: "480px" }}>
        <button
          type="button"
          onClick={() => uiStore.setCommandPaletteOpen(true)}
          aria-label="Open Command Palette (Ctrl+K)"
          style={{
            width: "100%",
            height: "28px",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 var(--space-3)",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-xs)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <SearchIcon size={13} />
            <span>Search commands or workspaces...</span>
          </div>
          <kbd
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              padding: "0 4px",
              fontSize: "10px",
              fontFamily: "var(--font-family-mono)",
            }}
          >
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Operational Status & Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Backend Connectivity Status Dot */}
        <div
          title={`Backend status: ${connectionState} (HTTP 5123)`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "2px 8px",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-subtle)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: getConnectionDotColor(connectionState),
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-medium)" }}>
            {connectionState === "CONNECTED" ? "Backend Live" : connectionState}
          </span>
          {loading && (
            <span style={{ fontSize: "10px", color: "var(--color-accent)" }}>●</span>
          )}
        </div>

        {/* Notification Center Trigger (Placed before Theme Changing Icon) */}
        <button
          ref={notificationButtonRef}
          type="button"
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          title={
            totalNotifications > 0
              ? `${totalNotifications} notification(s) / pending approval(s)`
              : "Notifications and Approvals"
          }
          aria-label="Open notifications and pending approvals"
          aria-expanded={notificationsOpen}
          style={{
            position: "relative",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            backgroundColor: notificationsOpen ? "var(--color-surface-hover)" : "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            color: totalNotifications > 0 ? (pendingApprovalsCount > 0 ? "var(--color-danger)" : "var(--color-accent)") : "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          <BellIcon size={14} />
          {totalNotifications > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                minWidth: "15px",
                height: "15px",
                padding: "0 3px",
                borderRadius: "999px",
                backgroundColor: pendingApprovalsCount > 0 ? "var(--color-danger)" : "var(--color-accent)",
                color: "#ffffff",
                fontSize: "9px",
                fontWeight: "var(--font-weight-bold)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                border: "1px solid var(--color-surface)",
              }}
            >
              {totalNotifications > 99 ? "99+" : totalNotifications}
            </span>
          )}
        </button>

        {/* Theme Switcher Quick Action */}
        <button
          type="button"
          onClick={handleNextTheme}
          title={`Active theme: ${theme}. Click to switch theme.`}
          aria-label="Switch visual theme"
          style={{
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          {theme === "fluffyDark" ? <MoonIcon size={14} /> : <SunIcon size={14} />}
        </button>

        {/* Inspector Toggle */}
        <button
          type="button"
          onClick={() => uiStore.toggleInspector()}
          title={inspectorOpen ? "Close Inspector" : "Open Inspector"}
          aria-label="Toggle Contextual Inspector"
          aria-expanded={inspectorOpen}
          style={{
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            backgroundColor: inspectorOpen ? "var(--color-surface-hover)" : "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            color: inspectorOpen ? "var(--color-accent)" : "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          <PanelRightIcon size={14} />
        </button>
      </div>

      {/* Notification Popover Dropdown */}
      <NotificationPopover
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        anchorRef={notificationButtonRef}
      />
    </header>
  );
};
