/**
 * Fluffy Desktop - Shell Workspace
 * 
 * Central workspace container.
 * In Phase 2, hosts domain placeholders ready for future feature implementation.
 */

import React, { Suspense, lazy, Component } from "react";
import { useUiStore } from "../../stores/uiStore";
import { DOMAIN_DEFINITIONS } from "../../types/ui";
import { getDomainIcon, RefreshCwIcon } from "../../components/common/Icons";

const OperationsWorkspace = lazy(() =>
  import("../../features/operations/OperationsWorkspace").then((m) => ({ default: m.OperationsWorkspace }))
);
const SystemsWorkspace = lazy(() =>
  import("../../features/systems/SystemsWorkspace").then((m) => ({ default: m.SystemsWorkspace }))
);
const GuardianWorkspace = lazy(() =>
  import("../../features/guardian/GuardianWorkspace").then((m) => ({ default: m.GuardianWorkspace }))
);
const MemoryWorkspace = lazy(() =>
  import("../../features/memory/MemoryWorkspace").then((m) => ({ default: m.MemoryWorkspace }))
);
const TerminalWorkspace = lazy(() =>
  import("../../features/terminal/TerminalWorkspace").then((m) => ({ default: m.TerminalWorkspace }))
);
const ChatWorkspace = lazy(() =>
  import("../../features/chat/ChatWorkspace").then((m) => ({ default: m.ChatWorkspace }))
);
const ExtensionsWorkspace = lazy(() =>
  import("../../features/extensions/ExtensionsWorkspace").then((m) => ({ default: m.ExtensionsWorkspace }))
);
const AnalyticsWorkspace = lazy(() =>
  import("../../features/analytics/AnalyticsWorkspace").then((m) => ({ default: m.AnalyticsWorkspace }))
);
const SettingsWorkspace = lazy(() =>
  import("../../features/settings/SettingsWorkspace").then((m) => ({ default: m.SettingsWorkspace }))
);

const DOMAIN_PHASE_MAP: Record<string, string> = {
  operations: "Phase 3: Operations Workspace",
  systems: "Phase 4: Systems Domain",
  guardian: "Phase 5: Guardian & Memory Domain",
  memory: "Phase 5: Guardian & Memory Domain",
  terminal: "Phase 6: Terminal Workspace (ws://127.0.0.1:9003)",
  chat: "Phase 7: Chat & Voice Workspace",
  extensions: "Phase 8: Extensions Domain",
  analytics: "Phase 8: Analytics Domain",
  settings: "Phase 8: Settings Domain",
  agents: "Future Agent Workspace",
};

const WorkspaceLoadingFallback: React.FC = () => (
  <div
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-3)",
      color: "var(--color-text-muted)",
      height: "100%",
    }}
  >
    <RefreshCwIcon size={20} style={{ color: "var(--color-accent)" }} />
    <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)" }}>
      Loading workspace...
    </span>
  </div>
);

interface WorkspaceErrorBoundaryState {
  error: Error | null;
}

class WorkspaceErrorBoundary extends Component<React.PropsWithChildren, WorkspaceErrorBoundaryState> {
  state: WorkspaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            padding: "var(--space-6)",
            color: "var(--color-danger)",
          }}
        >
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>Workspace crashed</div>
          <pre
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              padding: "var(--space-3)",
              maxWidth: "600px",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {this.state.error.message}\n{this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "6px 16px",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-xs)",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Workspace: React.FC = () => {
  const activeDomain = useUiStore((s) => s.activeDomain);
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  const domain = DOMAIN_DEFINITIONS[activeDomain];
  const targetPhase = DOMAIN_PHASE_MAP[activeDomain] || "Future Phase";
  const activeViewObj = domain.views.find((v) => v.id === activeSidebarView);

  const isFullBleedDomain =
    activeDomain === "operations" ||
    activeDomain === "systems" ||
    activeDomain === "guardian" ||
    activeDomain === "memory" ||
    activeDomain === "terminal" ||
    activeDomain === "chat" ||
    activeDomain === "extensions" ||
    activeDomain === "analytics" ||
    activeDomain === "settings";

  return (
    <main
      role="main"
      aria-label={`${domain.label} Workspace`}
      style={{
        flex: 1,
        backgroundColor: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        padding: isFullBleedDomain ? 0 : "var(--space-5)",
      }}
    >
      <WorkspaceErrorBoundary>
      <Suspense fallback={<WorkspaceLoadingFallback />}>
        {activeDomain === "operations" ? (
          <OperationsWorkspace />
        ) : activeDomain === "systems" ? (
          <SystemsWorkspace />
        ) : activeDomain === "guardian" ? (
          <GuardianWorkspace />
        ) : activeDomain === "memory" ? (
          <MemoryWorkspace />
        ) : activeDomain === "terminal" ? (
          <TerminalWorkspace />
        ) : activeDomain === "chat" ? (
          <ChatWorkspace />
        ) : activeDomain === "extensions" ? (
          <ExtensionsWorkspace />
        ) : activeDomain === "analytics" ? (
          <AnalyticsWorkspace />
        ) : activeDomain === "settings" ? (
          <SettingsWorkspace />
        ) : (


        <>
          {/* Workspace Header Placeholder for future phases */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              paddingBottom: "var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
              marginBottom: "var(--space-6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-accent)",
                }}
              >
                {getDomainIcon(activeDomain, { size: 20 })}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <h1 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)" }}>
                    {domain.label}
                  </h1>
                  <span style={{ color: "var(--color-text-muted)" }}>/</span>
                  <span style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
                    {activeViewObj?.label || activeSidebarView}
                  </span>
                </div>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {domain.description}
                </p>
              </div>
            </div>

            <span
              style={{
                fontSize: "11px",
                fontWeight: "var(--font-weight-semibold)",
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              {targetPhase}
            </span>
          </div>

          {/* Workspace Canvas / Placeholder Content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-8)",
              textAlign: "center",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-muted)",
              }}
            >
              {getDomainIcon(activeDomain, { size: 24 })}
            </div>

            <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-semibold)" }}>
              {domain.label} Workspace Ready
            </h2>

            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", maxWidth: "420px", lineHeight: 1.5 }}>
              The persistent application shell is active. Full operational interfaces for <strong>{domain.label}</strong> ({activeViewObj?.label}) will be integrated in <strong>{targetPhase}</strong>.
            </p>

            <div
              style={{
                marginTop: "var(--space-4)",
                display: "flex",
                gap: "var(--space-2)",
                fontSize: "11px",
                color: "var(--color-text-muted)",
                backgroundColor: "var(--color-surface-subtle)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              <span>Domain: <code>{activeDomain}</code></span>
              <span>•</span>
              <span>View: <code>{activeSidebarView}</code></span>
              <span>•</span>
              <span>Architecture: <code>Shell Component V2</code></span>
            </div>
          </div>
        </>
      )}
      </Suspense>
      </WorkspaceErrorBoundary>
    </main>
  );
};

