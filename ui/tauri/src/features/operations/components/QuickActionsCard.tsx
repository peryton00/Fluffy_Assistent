/**
 * Fluffy Desktop - Quick Actions Card Component
 * 
 * Provides interactive operations for Normalize System (POST /normalize)
 * and Network Speed Benchmark (POST /net-speed) with live execution feedback.
 */

import React, { useState } from "react";
import { normalizeSystem, runSpeedTest } from "../../../services/api/operations";
import { telemetryCoordinator } from "../../../stores/telemetryStore";
import { logsCoordinator } from "../../../stores/logsStore";
import type { NormalizeResult, SpeedTestResult } from "../../../types/contracts";
import { ZapIcon, WifiIcon, RefreshCwIcon, CheckCircleIcon, AlertTriangleIcon } from "../../../components/common/Icons";

export const QuickActionsCard: React.FC = () => {
  // Normalize State
  const [normalizeState, setNormalizeState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [normalizeResult, setNormalizeResult] = useState<NormalizeResult | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  // Speed Test State
  const [speedState, setSpeedState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [speedResult, setSpeedResult] = useState<SpeedTestResult | null>(null);
  const [speedError, setSpeedError] = useState<string | null>(null);

  const handleNormalize = async () => {
    setNormalizeState("running");
    setNormalizeError(null);
    try {
      const res = await normalizeSystem();
      setNormalizeResult(res);
      setNormalizeState("success");
      // Trigger status & logs sync
      await Promise.all([telemetryCoordinator.refreshNow(), logsCoordinator.refreshNow()]);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
      setNormalizeState("error");
    }
  };

  const handleSpeedTest = async () => {
    setSpeedState("running");
    setSpeedError(null);
    try {
      const res = await runSpeedTest();
      setSpeedResult(res);
      setSpeedState("success");
      await logsCoordinator.refreshNow();
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : String(err));
      setSpeedState("error");
    }
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
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)", margin: 0 }}>
          Quick Operational Actions
        </h2>
        <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
          Authenticated dispatch
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
        {/* Action 1: Normalize System */}
        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--space-2)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}>
                  <ZapIcon size={14} />
                </span>
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                  Normalize System
                </span>
              </div>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                POST /normalize
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 0 0", lineHeight: 1.4 }}>
              Purges temporary files, resets sound/brightness baselines, and checks for anomaly processes.
            </p>
          </div>

          {normalizeState === "success" && normalizeResult && (
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-success)",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: "var(--font-weight-semibold)" }}>
                <CheckCircleIcon size={12} />
                <span>Normalization Completed</span>
              </div>
              <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                {normalizeResult.cleanup && <div>• {normalizeResult.cleanup}</div>}
                {normalizeResult.settings && <div>• {normalizeResult.settings}</div>}
                {normalizeResult.unusual_processes && normalizeResult.unusual_processes.length > 0 && (
                  <div>• {normalizeResult.unusual_processes.length} unusual process(es) noted</div>
                )}
              </div>
            </div>
          )}

          {normalizeState === "error" && (
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-danger)",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertTriangleIcon size={12} />
                <span>{normalizeError || "Normalization failed"}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={normalizeState === "running"}
            onClick={handleNormalize}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: normalizeState === "running" ? "var(--color-text-muted)" : "var(--color-text)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              cursor: normalizeState === "running" ? "not-allowed" : "pointer",
              transition: "background-color var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              if (normalizeState !== "running") e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
            }}
            onMouseLeave={(e) => {
              if (normalizeState !== "running") e.currentTarget.style.backgroundColor = "var(--color-surface)";
            }}
          >
            <RefreshCwIcon size={12} style={{ transform: normalizeState === "running" ? "rotate(180deg)" : "none", transition: "transform 0.3s" }} />
            <span>{normalizeState === "running" ? "Normalizing..." : "Execute Normalize"}</span>
          </button>
        </div>

        {/* Action 2: Network Speed Test */}
        <div
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--space-2)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}>
                  <WifiIcon size={14} />
                </span>
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                  Speed & Latency Test
                </span>
              </div>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                POST /net-speed
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 0 0", lineHeight: 1.4 }}>
              Runs live ICMP roundtrip ping and throughput bandwidth test against backend network adapters.
            </p>
          </div>

          {speedState === "success" && speedResult && (
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-success)",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: "var(--font-weight-semibold)" }}>
                <CheckCircleIcon size={12} />
                <span>Benchmark Complete</span>
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "4px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-text)" }}>
                {speedResult.download_mbps !== undefined && (
                  <div>Speed: <strong>{speedResult.download_mbps} Mbps</strong></div>
                )}
                {speedResult.ping_ms !== undefined && (
                  <div>Ping: <strong>{speedResult.ping_ms} ms</strong></div>
                )}
              </div>
            </div>
          )}

          {speedState === "error" && (
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-danger)",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertTriangleIcon size={12} />
                <span>{speedError || "Speed test failed"}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={speedState === "running"}
            onClick={handleSpeedTest}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: speedState === "running" ? "var(--color-text-muted)" : "var(--color-text)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              cursor: speedState === "running" ? "not-allowed" : "pointer",
              transition: "background-color var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              if (speedState !== "running") e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
            }}
            onMouseLeave={(e) => {
              if (speedState !== "running") e.currentTarget.style.backgroundColor = "var(--color-surface)";
            }}
          >
            <WifiIcon size={12} />
            <span>{speedState === "running" ? "Testing Speed..." : "Run Speed Test"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
