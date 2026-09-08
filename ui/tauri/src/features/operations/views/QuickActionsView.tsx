/**
 * Fluffy Desktop - Quick Actions Dedicated View
 * 
 * Specialized operations surface with categorized actions:
 * - System maintenance & normalization (POST /normalize)
 * - Network latency and throughput benchmarking (POST /net-speed)
 * - Rapid workspace navigation shortcuts
 */

import React, { useState } from "react";
import { normalizeSystem, runSpeedTest } from "../../../services/api/operations";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { logsCoordinator } from "../../../stores/logsStore";
import { uiStore } from "../../../stores/uiStore";
import type { NormalizeResult, SpeedTestResult } from "../../../types/contracts";
import type { ActiveDomain } from "../../../types/ui";
import { OperationalHeader } from "../components/OperationalHeader";
import {
  ZapIcon,
  WifiIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CpuIcon,
  ShieldIcon,
  TerminalIcon,
  DatabaseIcon,
} from "../../../components/common/Icons";


export const QuickActionsView: React.FC = () => {
  // Normalize State
  const [normalizeLoading, setNormalizeLoading] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<NormalizeResult | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  // Speed Test State
  const [speedLoading, setSpeedLoading] = useState(false);
  const [speedResult, setSpeedResult] = useState<SpeedTestResult | null>(null);
  const [speedError, setSpeedError] = useState<string | null>(null);

  const handleNormalize = async () => {
    setNormalizeLoading(true);
    setNormalizeError(null);
    try {
      const res = await normalizeSystem();
      setNormalizeResult(res);
      await Promise.all([telemetryCoordinator.refreshNow(), logsCoordinator.refreshNow()]);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setNormalizeLoading(false);
    }
  };

  const handleSpeedTest = async () => {
    setSpeedLoading(true);
    setSpeedError(null);
    try {
      const res = await runSpeedTest();
      setSpeedResult(res);
      await logsCoordinator.refreshNow();
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : String(err));
    } finally {
      setSpeedLoading(false);
    }
  };

  const handleNavigate = (domain: ActiveDomain, view?: string) => {
    uiStore.setActiveDomain(domain);
    if (view) {
      uiStore.setActiveSidebarView(view);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
      <OperationalHeader
        title="Operations — Quick Actions"
        subtitle="Operational routines, diagnostic tools, and command dispatches"
      />

      {/* System Actions Section */}
      <section aria-label="System Operations">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            System Maintenance & Optimization
          </h2>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <div style={{ maxWidth: "600px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}>
                  <ZapIcon size={16} />
                </span>
                <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
                  Normalize Host System
                </h3>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                  POST /normalize
                </span>
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0 0", lineHeight: 1.5 }}>
                Issues a core normalization request through TCP 9002 IPC. Cleans transient caches and temp files, restores audio and display baseline levels, and audits executing processes for behavioral anomalies.
              </p>
            </div>

            <button
              type="button"
              disabled={normalizeLoading}
              onClick={handleNormalize}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "8px 16px",
                backgroundColor: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                borderRadius: "var(--radius-xs)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "var(--font-weight-bold)",
                cursor: normalizeLoading ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCwIcon size={13} style={{ transform: normalizeLoading ? "rotate(180deg)" : "none", transition: "transform 0.3s" }} />
              <span>{normalizeLoading ? "Normalizing System..." : "Normalize Now"}</span>
            </button>
          </div>

          {normalizeResult && (
            <div
              style={{
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-xs)",
                padding: "var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "var(--font-weight-bold)", color: "var(--color-success)" }}>
                <CheckCircleIcon size={14} />
                <span>Normalization Routine Complete</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-2)" }}>
                {normalizeResult.cleanup && <div><strong>Cleanup:</strong> {normalizeResult.cleanup}</div>}
                {normalizeResult.settings && <div><strong>Settings:</strong> {normalizeResult.settings}</div>}
                {normalizeResult.unusual_processes && (
                  <div><strong>Anomaly Check:</strong> {normalizeResult.unusual_processes.length} unusual processes</div>
                )}
              </div>
            </div>
          )}

          {normalizeError && (
            <div style={{ fontSize: "11px", color: "var(--color-danger)", backgroundColor: "rgba(239, 68, 68, 0.1)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              {normalizeError}
            </div>
          )}
        </div>
      </section>

      {/* Network Diagnostics Section */}
      <section aria-label="Network Diagnostics">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            Network Benchmarking
          </h2>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <div style={{ maxWidth: "600px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}>
                  <WifiIcon size={16} />
                </span>
                <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
                  Network Speed & Latency Benchmark
                </h3>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                  POST /net-speed
                </span>
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0 0", lineHeight: 1.5 }}>
                Measures current Internet latency (ICMP ping) and active download bandwidth using host network utilities.
              </p>
            </div>

            <button
              type="button"
              disabled={speedLoading}
              onClick={handleSpeedTest}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "8px 16px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xs)",
                color: "var(--color-text)",
                fontSize: "12px",
                fontWeight: "var(--font-weight-bold)",
                cursor: speedLoading ? "not-allowed" : "pointer",
              }}
            >
              <WifiIcon size={13} />
              <span>{speedLoading ? "Testing..." : "Run Speed Test"}</span>
            </button>
          </div>

          {speedResult && (
            <div
              style={{
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-xs)",
                padding: "var(--space-3)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-6)",
              }}
            >
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Download Bandwidth</span>
                <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}>
                  {speedResult.download_mbps !== undefined ? `${speedResult.download_mbps} Mbps` : "N/A"}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Latency / Ping</span>
                <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
                  {speedResult.ping_ms !== undefined ? `${speedResult.ping_ms} ms` : "N/A"}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Status</span>
                <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-success)" }}>
                  PASSED
                </div>
              </div>
            </div>
          )}

          {speedError && (
            <div style={{ fontSize: "11px", color: "var(--color-danger)", backgroundColor: "rgba(239, 68, 68, 0.1)", padding: "var(--space-2)", borderRadius: "var(--radius-xs)" }}>
              {speedError}
            </div>
          )}
        </div>
      </section>

      {/* Navigation Shortcuts */}
      <section aria-label="Navigation Shortcuts">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
            Workspace Navigation Shortcuts
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
          {[
            { label: "Processes Explorer", domain: "systems" as ActiveDomain, view: "processes", icon: <CpuIcon size={16} />, desc: "System process tree & metrics" },
            { label: "Guardian Threat Radar", domain: "guardian" as ActiveDomain, view: "alerts", icon: <ShieldIcon size={16} />, desc: "Behavioral alerts & whitelists" },
            { label: "Bridge Terminal", domain: "terminal" as ActiveDomain, view: "console", icon: <TerminalIcon size={16} />, desc: "Direct Core WS shell" },
            { label: "Memory Knowledge", domain: "memory" as ActiveDomain, view: "overview", icon: <DatabaseIcon size={16} />, desc: "Sessions & long-term memory" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavigate(item.domain, item.view)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "var(--space-2)",
                padding: "var(--space-3)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface)")}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}>{item.icon}</span>
                <ChevronRightIcon size={12} style={{ color: "var(--color-text-muted)" }} />
              </div>
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                  {item.label}
                </span>
                <p style={{ fontSize: "10px", color: "var(--color-text-muted)", margin: "2px 0 0 0" }}>
                  {item.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
