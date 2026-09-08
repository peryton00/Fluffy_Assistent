/**
 * Fluffy Desktop - Pending Approvals View
 *
 * Authorization management interface displaying pending privileged operations
 * requested by AI runtime or automation with explicit Authorize / Reject controls.
 */

import React, { useState } from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../../stores/telemetryStore";
import { useGuardianStore } from "../../../stores/guardianStore";
import { useUIStore } from "../../../stores/uiStore";
import {
  ShieldAlertIcon,
  CheckCircleIcon,
  XCircleIcon,
  SearchIcon,
  RefreshIcon,
  InfoIcon,
} from "../../../components/common/Icons";
import type { PendingApproval } from "../../../types/contracts";

const getRiskStyle = (risk?: string): React.CSSProperties => {
  const r = risk?.toLowerCase();
  if (r === "high" || r === "critical")
    return { color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)" };
  if (r === "medium")
    return { color: "var(--color-warning)", backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)" };
  return { color: "var(--color-accent)", backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)" };
};

export const PendingApprovalsView: React.FC = () => {
  const telemetry = useTelemetryStore();
  const guardian = useGuardianStore();
  const { setInspectorItem } = useUIStore();

  const [searchQuery, setSearchQuery] = useState<string>("");

  const rawApprovals: PendingApproval[] = (telemetry.snapshot?.pending_confirmations || []).map((c) => ({
    id: c.id || c.command_id || "approval",
    command_id: c.command_id,
    action: c.action || c.command_name || "Elevated Action",
    requester: c.requester || "System",
    target: c.target || (c.args ? JSON.stringify(c.args) : undefined),
    risk: c.risk,
    reason: c.reason,
    params: (c.params || c.args) as Record<string, unknown> | undefined,
    timestamp: c.timestamp,
  }));

  const filteredApprovals = rawApprovals.filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.id.toLowerCase().includes(q) ||
      (app.command_id && app.command_id.toLowerCase().includes(q)) ||
      app.action.toLowerCase().includes(q) ||
      app.target?.toLowerCase().includes(q) ||
      app.reason?.toLowerCase().includes(q) ||
      app.requester?.toLowerCase().includes(q)
    );
  });

  const handleAuthorize = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await guardian.authorize(id);
  };

  const handleReject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await guardian.reject(id);
  };

  const card: React.CSSProperties = {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Search and Status Header */}
      <div style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", display: "flex" }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Search approvals by ID, action, target, or requester..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: "32px",
              paddingRight: "12px",
              paddingTop: "7px",
              paddingBottom: "7px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => telemetryCoordinator.refreshNow()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-xs)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <RefreshIcon size={13} />
          Refresh
        </button>
      </div>

      {/* Approvals List */}
      {filteredApprovals.length === 0 ? (
        <div style={{ ...card, padding: "var(--space-6)", alignItems: "center", justifyContent: "center", gap: "var(--space-3)" }}>
          <span style={{ color: "var(--color-success)", display: "flex" }}><CheckCircleIcon size={40} /></span>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            Authorization Queue Clear
          </div>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: 0, textAlign: "center", maxWidth: "400px" }}>
            There are no pending actions requiring elevation or explicit confirmation.
            Protected system actions requested by Fluffy will appear here for review.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {filteredApprovals.map((approval) => {
            const inFlight = guardian.inFlightApprovals[approval.id] || (approval.command_id ? guardian.inFlightApprovals[approval.command_id] : undefined);
            const isAuthorizing = inFlight === "authorizing";
            const isRejecting = inFlight === "rejecting";

            return (
              <div
                key={approval.id}
                onClick={() =>
                  setInspectorItem({
                    id: approval.id,
                    type: "pendingApproval",
                    title: `Approval: ${approval.command_id || approval.id}`,
                    data: approval as unknown as Record<string, unknown>,
                  })
                }
                style={{
                  ...card,
                  cursor: "pointer",
                  gap: "var(--space-4)",
                  transition: "border-color var(--transition-fast)",
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    paddingBottom: "var(--space-3)",
                    borderBottom: "1px solid var(--color-border)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "var(--radius-xs)",
                        backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-accent)",
                        flexShrink: 0,
                      }}
                    >
                      <ShieldAlertIcon size={16} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 2px" }}>
                        {approval.action}
                      </h3>
                      <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                        Requested by: <strong style={{ color: "var(--color-text-secondary)" }}>{approval.requester || "AI Agent / Core"}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    {approval.risk && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "var(--font-weight-bold)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          ...getRiskStyle(approval.risk),
                        }}
                      >
                        {approval.risk} Risk
                      </span>
                    )}
                    <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                      ID: {approval.command_id || approval.id}
                    </span>
                  </div>
                </div>

                {/* Target and Reason */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
                  {approval.target && (
                    <div>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                        Target Resource:
                      </span>
                      <div
                        style={{
                          backgroundColor: "var(--color-bg)",
                          padding: "var(--space-2) var(--space-3)",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--color-border)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-text-secondary)",
                          wordBreak: "break-all",
                        }}
                      >
                        {approval.target}
                      </div>
                    </div>
                  )}
                  {approval.reason && (
                    <div>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                        Reason / Intent:
                      </span>
                      <div
                        style={{
                          backgroundColor: "var(--color-bg)",
                          padding: "var(--space-2) var(--space-3)",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--color-border)",
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {approval.reason}
                      </div>
                    </div>
                  )}
                </div>

                {/* Parameters Preview */}
                {approval.params && Object.keys(approval.params).length > 0 && (
                  <div>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                      Execution Parameters:
                    </span>
                    <pre
                      style={{
                        padding: "var(--space-3)",
                        backgroundColor: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-xs)",
                        fontSize: "var(--font-size-xs)",
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-text-muted)",
                        overflowX: "auto",
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(approval.params, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Footer Controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-2)" }}>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <InfoIcon size={12} />
                    Click card to inspect full security payload.
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => handleReject(e, approval.command_id || approval.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 14px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-danger)",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <XCircleIcon size={14} />
                      {isRejecting ? "Rejecting..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      disabled={!!inFlight}
                      onClick={(e) => handleAuthorize(e, approval.command_id || approval.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 16px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-semibold)",
                        backgroundColor: "var(--color-success)",
                        border: "1px solid var(--color-success)",
                        borderRadius: "var(--radius-xs)",
                        color: "#fff",
                        cursor: inFlight ? "wait" : "pointer",
                        opacity: inFlight ? 0.5 : 1,
                      }}
                    >
                      <CheckCircleIcon size={14} />
                      {isAuthorizing ? "Authorizing..." : "Authorize"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
