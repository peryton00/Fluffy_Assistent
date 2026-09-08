/**
 * Fluffy Desktop - Advanced Settings & Maintenance View
 * 
 * Diagnostic controls, system normalization triggers, threat cache purge,
 * and subsystem network port verification.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState } from "react";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import {
  SlidersIcon,
  ZapIcon,
  ShieldIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
  ServerIcon,
} from "../../../components/common/Icons";

export const AdvancedView: React.FC = () => {
  const { actionLoading, error } = useSettingsStore();

  const [normalizeStatus, setNormalizeStatus] = useState<string | null>(null);
  const [guardianPurgeStatus, setGuardianPurgeStatus] = useState<string | null>(null);
  const [sessionResetStatus, setSessionResetStatus] = useState<string | null>(null);

  const handleRunNormalization = async () => {
    const res = await settingsStore.runNormalization();
    setNormalizeStatus(res.message);
    setTimeout(() => setNormalizeStatus(null), 5000);
  };

  const handleClearGuardian = async () => {
    const ok = await settingsStore.clearGuardian();
    if (ok) {
      setGuardianPurgeStatus("Guardian threat cache purged successfully");
      setTimeout(() => setGuardianPurgeStatus(null), 4000);
    }
  };

  const handleResetSession = async () => {
    const ok = await settingsStore.resetSession();
    if (ok) {
      setSessionResetStatus("Active conversational session reset");
      setTimeout(() => setSessionResetStatus(null), 4000);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SlidersIcon size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Advanced Diagnostics & Operations
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              System optimization, security cache reset, and runtime bridge verification.
            </p>
          </div>
        </div>
      </header>

      {/* Main Settings Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "780px", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {error && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-danger)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
            }}
          >
            <AlertTriangleIcon size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{error.message}</span>
          </div>
        )}

        {/* Maintenance Actions Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Operational Maintenance
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
            {/* 1. Normalize Action */}
            <div
              style={{
                padding: "var(--space-4)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginBottom: "4px" }}>
                  <ZapIcon size={14} style={{ color: "var(--color-warning)" }} />
                  <span>Run Normalizer</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0 }}>
                  Triggers OS memory compaction and terminates rogue high-leak background processes.
                </p>
              </div>

              <div>
                {normalizeStatus && (
                  <span style={{ fontSize: "10px", color: "var(--color-success)", display: "block", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                    {normalizeStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRunNormalization}
                  disabled={actionLoading}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    cursor: actionLoading ? "not-allowed" : "pointer",
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  Optimize Now
                </button>
              </div>
            </div>

            {/* 2. Guardian Purge Action */}
            <div
              style={{
                padding: "var(--space-4)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginBottom: "4px" }}>
                  <ShieldIcon size={14} style={{ color: "var(--color-danger)" }} />
                  <span>Clear Threat Cache</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0 }}>
                  Clears temporary Guardian alert state and behavioral anomaly history.
                </p>
              </div>

              <div>
                {guardianPurgeStatus && (
                  <span style={{ fontSize: "10px", color: "var(--color-success)", display: "block", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                    {guardianPurgeStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClearGuardian}
                  disabled={actionLoading}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    cursor: actionLoading ? "not-allowed" : "pointer",
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  Purge Alerts
                </button>
              </div>
            </div>

            {/* 3. Session Reset Action */}
            <div
              style={{
                padding: "var(--space-4)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", marginBottom: "4px" }}>
                  <RotateCcwIcon size={14} style={{ color: "var(--color-accent)" }} />
                  <span>Reset Session</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0 }}>
                  Purges active working conversation context and restarts memory tracking.
                </p>
              </div>

              <div>
                {sessionResetStatus && (
                  <span style={{ fontSize: "10px", color: "var(--color-success)", display: "block", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                    {sessionResetStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetSession}
                  disabled={actionLoading}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    cursor: actionLoading ? "not-allowed" : "pointer",
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  Reset Session
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Runtime Network Ports Diagnostics */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: "var(--space-2)" }}>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
              <ServerIcon size={14} style={{ color: "var(--color-accent)" }} />
              Runtime Architecture & Network Ports
            </h3>
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              Local IPC Loopback
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-2)", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)" }}>
            <div style={{ padding: "8px 12px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block", fontFamily: "inherit" }}>Python Brain Web API</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>127.0.0.1:5123</span>
              </div>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-success-subtle)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}>
                HTTP
              </span>
            </div>

            <div style={{ padding: "8px 12px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block", fontFamily: "inherit" }}>Rust Core Telemetry</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>127.0.0.1:9001</span>
              </div>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent)", border: "1px solid var(--color-accent-border)" }}>
                TCP IPC
              </span>
            </div>

            <div style={{ padding: "8px 12px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block", fontFamily: "inherit" }}>Rust Core Commands</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>127.0.0.1:9002</span>
              </div>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-warning-subtle)", color: "var(--color-warning)", border: "1px solid var(--color-warning-border)" }}>
                TCP IPC
              </span>
            </div>

            <div style={{ padding: "8px 12px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block", fontFamily: "inherit" }}>Core Terminal Bridge</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>127.0.0.1:9003</span>
              </div>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent)", border: "1px solid var(--color-accent-border)" }}>
                WebSocket
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
