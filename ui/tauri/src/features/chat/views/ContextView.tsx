/**
 * Fluffy Desktop - ContextView Component
 * 
 * Inspects real-time runtime context provided to the Python Brain & LLM:
 * Session parameters, Guardian security posture, system resource limits,
 * and persistent Long-Term Memory facts.
 */

import React from "react";
import { ChatHeader } from "../components/ChatHeader";
import { useChatStore } from "../../../stores/chatStore";
import { useGuardianStore } from "../../../stores/guardianStore";
import { useMemoryStore } from "../../../stores/memoryStore";
import { useTelemetryStore } from "../../../stores/telemetryStore";
import { useUiStore } from "../../../stores/uiStore";
import { 
  LayersIcon, 
  ShieldIcon, 
  DatabaseIcon, 
  ActivityIcon, 
  ExternalLinkIcon, 
  SparklesIcon
} from "../../../components/common/Icons";

export const ContextView: React.FC = () => {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const messages = useChatStore((state) => state.messages);
  
  const guardianState = useGuardianStore();
  const memoryState = useMemoryStore();
  const snapshot = useTelemetryStore((state) => state.snapshot);
  
  const selectDomain = useUiStore((state) => state.selectDomain);

  const guardianMode = snapshot?.status || "Active";
  const pendingApprovalsCount = snapshot?.pending_confirmations?.length ?? 0;
  const trustedCount = guardianState.trustedProcesses?.length ?? 0;

  const facts: string[] = memoryState.profile?.facts ?? memoryState.memory?.facts ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      <ChatHeader />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "var(--space-4) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <span style={{ color: "var(--color-accent)", display: "flex" }}><LayersIcon size={16} /></span>
            <span>Brain Runtime Context</span>
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>
            Real-time contextual state injected into Fluffy's reasoning loop for the current session.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-4)" }}>
          {/* Card 1: Active Session State */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-accent)", display: "flex" }}><SparklesIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Active Session
                </h3>
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-accent-muted)",
                  color: "var(--color-accent)",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                ID: {activeSessionId ? activeSessionId.slice(0, 12) : "Default"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", fontSize: "var(--font-size-xs)" }}>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>Session Messages</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "var(--font-size-md)", margin: "2px 0 0 0" }}>{messages.length}</p>
              </div>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>Context Stream</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-success-text)", fontSize: "var(--font-size-md)", margin: "2px 0 0 0" }}>Active SSE</p>
              </div>
            </div>
          </div>

          {/* Card 2: Guardian Security Context */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-success)", display: "flex" }}><ShieldIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Guardian Policy Layer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectDomain("guardian")}
                style={{
                  fontSize: "10px",
                  color: "var(--color-accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span>Manage</span>
                <ExternalLinkIcon size={11} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", fontSize: "var(--font-size-xs)" }}>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>Active Policy Mode</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", margin: "2px 0 0 0", textTransform: "capitalize" }}>{guardianMode}</p>
              </div>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>Trusted Whitelist</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", margin: "2px 0 0 0" }}>{trustedCount} processes</p>
              </div>
            </div>
            {pendingApprovalsCount > 0 && (
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-warning-muted)", border: "1px solid var(--color-warning)", fontSize: "11px", color: "var(--color-warning-text)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{pendingApprovalsCount} confirmation(s) pending review</span>
                <button type="button" onClick={() => selectDomain("guardian")} style={{ color: "var(--color-warning-text)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontWeight: "bold" }}>Review</button>
              </div>
            )}
          </div>

          {/* Card 3: System Live Metrics */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-warning)", display: "flex" }}><ActivityIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Operational Telemetry
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectDomain("operations")}
                style={{
                  fontSize: "10px",
                  color: "var(--color-accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span>Telemetry</span>
                <ExternalLinkIcon size={11} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", fontSize: "var(--font-size-xs)" }}>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>CPU Load</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", margin: "2px 0 0 0", fontFamily: "var(--font-mono)" }}>
                  {snapshot?.cpu?.usage_percent !== undefined ? `${snapshot.cpu.usage_percent.toFixed(1)}%` : "Ready"}
                </p>
              </div>
              <div style={{ padding: "var(--space-2)", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>RAM Allocation</span>
                <p style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", margin: "2px 0 0 0", fontFamily: "var(--font-mono)" }}>
                  {snapshot?.ram?.usage_percent !== undefined ? `${snapshot.ram.usage_percent.toFixed(1)}%` : "Ready"}
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Persistent Semantic Facts */}
          <div
            style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--color-info)", display: "flex" }}><DatabaseIcon size={16} /></span>
                <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0, color: "var(--color-text)" }}>
                  Long-Term Facts ({facts.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectDomain("memory")}
                style={{
                  fontSize: "10px",
                  color: "var(--color-accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span>Memory</span>
                <ExternalLinkIcon size={11} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: "140px", overflowY: "auto" }}>
              {facts.length > 0 ? (
                facts.map((fact, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-border-subtle)",
                      fontSize: "11px",
                      color: "var(--color-text)",
                    }}
                  >
                    • {fact}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                  No long-term facts stored yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
