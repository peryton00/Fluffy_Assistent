/**
 * Fluffy Desktop - Foundation Screen
 * 
 * Minimal operational verification view for Phase 1.
 * Demonstrates the full reactive chain:
 * React Components -> telemetryStore / uiStore -> statusService -> apiClient -> tokenAuth -> GET /status -> Backend
 */

import React from "react";
import { useTelemetryStore, telemetryCoordinator } from "../../stores/telemetryStore";
import { useUiStore, uiStore } from "../../stores/uiStore";
import type { ConnectionState, ActivityState, ThemeMode } from "../../types/ui";
import type { SubsystemHealth } from "../../types/contracts";

export const FoundationScreen: React.FC = () => {
  const {
    snapshot,
    loading,
    error,
    connectionState,
    lastUpdated,
    lastError,
    activityState,
  } = useTelemetryStore();

  const theme = useUiStore((s) => s.theme);

  // Derive Subsystem Health from Snapshot
  const coreHealth: SubsystemHealth = connectionState === "CONNECTED" ? "healthy" : "unknown";
  const brainHealth: SubsystemHealth = connectionState === "CONNECTED" ? "healthy" : "unknown";
  const guardianHealth: SubsystemHealth = (snapshot?.security_alerts && snapshot.security_alerts.length > 0)
    ? "degraded"
    : connectionState === "CONNECTED"
    ? "healthy"
    : "unknown";
  const memoryHealth: SubsystemHealth = connectionState === "CONNECTED" ? "healthy" : "unknown";

  // Formatted Metrics (Support both nested system format and flattened format)
  const cpuSource = snapshot?.system?.cpu || snapshot?.cpu;
  const ramSource = snapshot?.system?.ram || snapshot?.ram;
  const netSource = snapshot?.system?.network || snapshot?.networks;
  const procSource = snapshot?.system?.processes || snapshot?.processes;

  const cpuPercent = cpuSource?.usage_percent !== undefined
    ? `${cpuSource.usage_percent.toFixed(1)}%`
    : snapshot?.status === "initializing"
    ? "Initializing..."
    : "--";
  
  const ramMb = ramSource?.used_mb !== undefined && ramSource?.total_mb !== undefined
    ? `${(ramSource.used_mb / 1024).toFixed(1)} GB / ${(ramSource.total_mb / 1024).toFixed(1)} GB`
    : snapshot?.status === "initializing"
    ? "Initializing..."
    : "--";

  const networkText = Array.isArray(netSource) && netSource.length > 0
    ? `${netSource.length} active interface(s)`
    : netSource && typeof netSource === "object" && "status" in netSource
    ? `Status: ${(netSource as { status?: string }).status || "active"}`
    : snapshot?.status === "initializing"
    ? "Initializing..."
    : "--";

  const processCount = procSource?.total_count !== undefined
    ? `${procSource.total_count} processes`
    : snapshot?.status === "initializing"
    ? "Initializing..."
    : "--";

  const getStatusBadgeStyle = (state: ConnectionState): { bg: string; text: string; label: string } => {
    switch (state) {
      case "CONNECTED":
        return { bg: "var(--color-success-muted)", text: "var(--color-success-text)", label: "CONNECTED" };
      case "CONNECTING":
        return { bg: "var(--color-accent-muted)", text: "var(--color-accent)", label: "CONNECTING..." };
      case "AUTHENTICATION_FAILED":
        return { bg: "var(--color-danger-muted)", text: "var(--color-danger-text)", label: "AUTH FAILED (401/403)" };
      case "BACKEND_UNAVAILABLE":
        return { bg: "var(--color-danger-muted)", text: "var(--color-danger-text)", label: "BACKEND UNAVAILABLE (5123)" };
      case "STALE":
        return { bg: "var(--color-warning-muted)", text: "var(--color-warning-text)", label: "DATA STALE" };
      case "REQUEST_FAILED":
      default:
        return { bg: "var(--color-warning-muted)", text: "var(--color-warning-text)", label: "REQUEST FAILED" };
    }
  };

  const getHealthDotColor = (health: SubsystemHealth): string => {
    switch (health) {
      case "healthy": return "var(--color-success)";
      case "degraded": return "var(--color-warning)";
      case "unhealthy": return "var(--color-danger)";
      default: return "var(--color-text-muted)";
    }
  };

  const statusBadge = getStatusBadgeStyle(connectionState);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "var(--space-6)",
        maxWidth: "960px",
        margin: "0 auto",
        overflowY: "auto",
        gap: "var(--space-6)",
      }}
    >
      {/* Header Banner */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <h1 style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--letter-spacing-tight)" }}>
              Fluffy Desktop
            </h1>
            <span
              style={{
                fontSize: "var(--font-size-2xs)",
                fontWeight: "var(--font-weight-semibold)",
                textTransform: "uppercase",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              UI Phase 1 — Foundation
            </span>
          </div>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
            Production React + Vite + TypeScript Workbench Foundation
          </p>
        </div>

        {/* Global Connection Diagnostic Badge */}
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: statusBadge.bg,
            color: statusBadge.text,
            fontWeight: "var(--font-weight-semibold)",
            fontSize: "var(--font-size-xs)",
            border: "1px solid currentColor",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "currentColor",
              display: "inline-block",
            }}
          />
          {statusBadge.label}
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
        
        {/* Subsystems Health Card */}
        <section
          aria-labelledby="subsystems-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <h2 id="subsystems-heading" style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wider)", marginBottom: "var(--space-3)" }}>
            Subsystem Health
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {[
              { name: "Rust Core (TCP 9001/9002, WS 9003)", health: coreHealth },
              { name: "Python Brain (HTTP 5123)", health: brainHealth },
              { name: "Guardian Behavioral Security", health: guardianHealth },
              { name: "Persistent Memory Subsystem", health: memoryHealth },
            ].map((subsystem) => (
              <div
                key={subsystem.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--space-2) var(--space-3)",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                  {subsystem.name}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span
                    aria-label={`Status: ${subsystem.health}`}
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: getHealthDotColor(subsystem.health),
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: "var(--font-size-xs)", textTransform: "capitalize", color: "var(--color-text-muted)" }}>
                    {subsystem.health}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Operational Telemetry Card */}
        <section
          aria-labelledby="metrics-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
          }}
        >
          <h2 id="metrics-heading" style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wider)", marginBottom: "var(--space-3)" }}>
            Live System Metrics
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>CPU Usage</span>
              <span style={{ fontFamily: "var(--font-family-mono)", fontWeight: "var(--font-weight-semibold)" }}>{cpuPercent}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>System RAM</span>
              <span style={{ fontFamily: "var(--font-family-mono)", fontWeight: "var(--font-weight-semibold)" }}>{ramMb}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Network Interfaces</span>
              <span style={{ fontFamily: "var(--font-family-mono)", fontWeight: "var(--font-weight-semibold)" }}>{networkText}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) var(--space-3)", backgroundColor: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Monitored Processes</span>
              <span style={{ fontFamily: "var(--font-family-mono)", fontWeight: "var(--font-weight-semibold)" }}>{processCount}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Coordinator Controls & Diagnostics */}
      <section
        aria-labelledby="coordinator-heading"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
        }}
      >
        <h2 id="coordinator-heading" style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wider)", marginBottom: "var(--space-3)" }}>
          Telemetry Coordinator & Diagnostic Controls
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-4)" }}>
          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => telemetryCoordinator.refreshNow()}
            disabled={loading}
            style={{
              padding: "var(--space-2) var(--space-4)",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              borderRadius: "var(--radius-sm)",
              fontWeight: "var(--font-weight-medium)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {loading ? "Refreshing..." : "Refresh Now (GET /status)"}
          </button>

          {/* Activity State Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Cadence:</span>
            {(["ACTIVE", "IDLE"] as ActivityState[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => telemetryCoordinator.setActivityState(mode)}
                style={{
                  padding: "var(--space-1) var(--space-2)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: activityState === mode ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
                  backgroundColor: activityState === mode ? "var(--color-surface-hover)" : "transparent",
                  color: activityState === mode ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {mode === "ACTIVE" ? "ACTIVE (~2s)" : "IDLE (~10s)"}
              </button>
            ))}
          </div>

          {/* Theme Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", backgroundColor: "var(--color-surface-elevated)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Theme:</span>
            {(["fluffyDark", "fluffyLight", "highContrast"] as ThemeMode[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => uiStore.setTheme(t)}
                style={{
                  padding: "var(--space-1) var(--space-2)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: theme === t ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
                  backgroundColor: theme === t ? "var(--color-surface-hover)" : "transparent",
                  color: theme === t ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {t === "fluffyDark" ? "Dark" : t === "fluffyLight" ? "Light" : "High Contrast"}
              </button>
            ))}
          </div>
        </div>

        {/* Status Line Details */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-2)" }}>
          <div>Last Update: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Never"}</div>
          <div>Last Error: {lastError ? new Date(lastError).toLocaleTimeString() : "None"}</div>
          <div>Auth Route: <code className="font-mono">GET /config/token (Loopback)</code></div>
          <div>Header: <code className="font-mono">X-Fluffy-Token</code></div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: "var(--space-3)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-danger-muted)",
              color: "var(--color-danger-text)",
              fontSize: "var(--font-size-xs)",
              border: "1px solid var(--color-danger)",
            }}
          >
            <strong>Diagnostic Error:</strong> {error.message}
          </div>
        )}
      </section>

      {/* Architectural Guarantees Footer */}
      <footer
        style={{
          marginTop: "auto",
          paddingTop: "var(--space-4)",
          borderTop: "1px solid var(--color-border)",
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-muted)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <span>Pipeline: Component → Store → Typed API Service → Loopback Auth → HTTP 5123</span>
        <span>Offline-First (0 external network calls)</span>
      </footer>
    </main>
  );
};
