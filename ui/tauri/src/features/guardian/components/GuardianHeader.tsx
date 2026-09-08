/**
 * Fluffy Desktop - Guardian Header Component
 *
 * Header bar and sub-navigation tabs for Guardian workspace.
 */

import React, { useState } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ActivityIcon,
} from "../../../components/common/Icons";
import type { GuardianSection } from "../../../types/ui";

interface GuardianHeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => Promise<void> | void;
}

export const GuardianHeader: React.FC<GuardianHeaderProps> = ({
  title = "Guardian & Security Policy",
  subtitle = "Behavioral anomaly detection, elevated command authorizations, and process security whitelists",
  onRefresh,
}) => {
  const { guardianSection, selectGuardianSection } = useUIStore();
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pendingCount = snapshot?.pending_confirmations?.length || 0;
  const alertCount = snapshot?.security_alerts?.length || 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await telemetryCoordinator.refreshNow();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const sections: { id: GuardianSection; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    { id: "overview", label: "Overview", icon: <ActivityIcon size={14} /> },
    {
      id: "alerts",
      label: "Threat Alerts",
      icon: <ShieldAlertIcon size={14} />,
      badge: alertCount > 0 ? alertCount : undefined,
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: <ShieldCheckIcon size={14} />,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { id: "trusted", label: "Trusted", icon: <ShieldCheckIcon size={14} /> },
    { id: "history", label: "Audit History", icon: <CheckCircleIcon size={14} /> },
  ];

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Top Banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-accent)",
            }}
          >
            <ShieldAlertIcon size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                {title}
              </h1>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  backgroundColor: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                  color: "var(--color-success)",
                  border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
                }}
              >
                Active Guard
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
              {subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isRefreshing}
          onClick={handleRefresh}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--font-size-xs)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            color: "var(--color-text)",
            cursor: isRefreshing ? "wait" : "pointer",
            opacity: isRefreshing ? 0.6 : 1,
          }}
        >
          <RefreshCwIcon size={13} style={isRefreshing ? { animation: "spin 1s linear infinite" } : {}} />
          Refresh State
        </button>
      </div>

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "var(--space-2)",
          overflowX: "auto",
        }}
      >
        {sections.map((sec) => {
          const isActive = guardianSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => selectGuardianSection(sec.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                border: isActive ? "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)" : "1px solid transparent",
                backgroundColor: isActive ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent",
                color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all var(--transition-fast)",
              }}
            >
              <span style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-muted)", display: "flex" }}>
                {sec.icon}
              </span>
              {sec.label}
              {sec.badge !== undefined && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    fontFamily: "var(--font-mono)",
                    backgroundColor: isActive
                      ? "color-mix(in srgb, var(--color-accent) 25%, transparent)"
                      : "var(--color-surface-elevated)",
                    color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}
                >
                  {sec.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
