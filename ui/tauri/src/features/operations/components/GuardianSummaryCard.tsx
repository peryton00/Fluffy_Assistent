/**
 * Fluffy Desktop - Guardian Summary Card Component
 * 
 * Concise security summary card on the Operations overview.
 * Surfaces threat alerts count, pending approvals count, and quick jump to Guardian.
 */

import React from "react";
import { uiStore } from "../../../stores/uiStore";
import type { TelemetrySnapshot } from "../../../types/contracts";
import { ShieldIcon, ShieldCheckIcon, ChevronRightIcon } from "../../../components/common/Icons";


interface GuardianSummaryCardProps {
  snapshot: TelemetrySnapshot | null;
}

export const GuardianSummaryCard: React.FC<GuardianSummaryCardProps> = ({ snapshot }) => {
  const alerts = snapshot?.security_alerts || [];
  const pending = snapshot?.pending_confirmations || [];
  const activeAlertsCount = alerts.length;
  const pendingCount = pending.length;
  const isSecure = activeAlertsCount === 0 && pendingCount === 0;

  const handleReviewGuardian = () => {
    uiStore.setActiveDomain("guardian");
    uiStore.setActiveSidebarView("overview");
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ display: "flex", color: isSecure ? "var(--color-success)" : "var(--color-warning)" }}>
            {isSecure ? <ShieldCheckIcon size={16} /> : <ShieldIcon size={16} />}
          </span>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            Guardian Security
          </h2>
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: "var(--font-weight-bold)",
            color: isSecure ? "var(--color-success)" : "var(--color-warning)",
            backgroundColor: "var(--color-surface-elevated)",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          {isSecure ? "ACTIVE / SECURE" : "ATTENTION REQUIRED"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Threat Alerts
          </span>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", color: activeAlertsCount > 0 ? "var(--color-danger)" : "var(--color-text)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
            {activeAlertsCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Pending Actions
          </span>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", color: pendingCount > 0 ? "var(--color-warning)" : "var(--color-text)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
            {pendingCount}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleReviewGuardian}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-2) var(--space-3)",
          backgroundColor: "var(--color-surface-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xs)",
          color: "var(--color-text)",
          fontSize: "11px",
          fontWeight: "var(--font-weight-medium)",
          cursor: "pointer",
          transition: "background-color var(--transition-fast)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)")}
      >
        <span>Review Guardian Workspace</span>
        <ChevronRightIcon size={12} />
      </button>
    </div>
  );
};
