/**
 * Fluffy Desktop - Shell Inspector
 * 
 * Contextual right-side drawer panel.
 * Driven by uiStore.inspectorOpen and uiStore.selectedItem.
 * Displays granular properties and direct context actions for:
 * - Telemetry metrics (CPU, RAM, Disks, Network, Battery)
 * - Processes (Terminate action)
 * - Applications (Launch, Uninstall actions)
 * - Startup persistence items (Toggle status, Remove actions)
 * - Distributed LAN machines (Switch target, Remove actions)
 * - Security threats and logs
 */

import React, { useState } from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import {
  CloseIcon,
  PanelRightIcon,
  TerminalIcon,
  ShieldIcon,
  CpuIcon,
  DatabaseIcon,
  HardDriveIcon,
  WifiIcon,
  BatteryIcon,
  ActivityIcon,
  GridIcon,
  LayersIcon,
  ServerIcon,
  TrashIcon,
  PlayIcon,
  CheckIcon,
  PuzzleIcon,
  BarChartIcon,
  SettingsIcon,
  RefreshCwIcon,
} from "../../components/common/Icons";
import { killProcess, toggleStartupApp, removeStartupApp } from "../../services/api/systems";
import { networkStore } from "../../stores/networkStore";
import { telemetryCoordinator } from "../../stores/telemetryStore";
import { appsStore } from "../../stores/appsStore";
import { guardianStore } from "../../stores/guardianStore";
import { memoryStore } from "../../stores/memoryStore";
import { terminalStore } from "../../stores/terminalStore";
import { extensionsStore } from "../../stores/extensionsStore";

export const Inspector: React.FC = () => {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const selectedItem = useUiStore((s) => s.selectedItem);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (!inspectorOpen) {
    return null;
  }

  const getItemIcon = (type?: string) => {
    switch (type) {
      case "cpu":
        return <CpuIcon size={16} />;
      case "ram":
        return <DatabaseIcon size={16} />;
      case "disk":
        return <HardDriveIcon size={16} />;
      case "network":
        return <WifiIcon size={16} />;
      case "battery":
        return <BatteryIcon size={16} />;
      case "process":
        return <ActivityIcon size={16} />;
      case "application":
        return <GridIcon size={16} />;
      case "startup":
        return <LayersIcon size={16} />;
      case "machine":
      case "agentNode":
      case "terminalNode":
        return <ServerIcon size={16} />;
      case "hardware":
        return <CpuIcon size={16} />;
      case "alert":
      case "guardianAlert":
        return <ShieldIcon size={16} />;
      case "pendingApproval":
      case "trustedProcess":
        return <ShieldIcon size={16} />;
      case "log":
      case "guardianEvent":
        return <TerminalIcon size={16} />;
      case "memorySession":
      case "memoryProfile":
      case "memoryPreference":
      case "knowledgeItem":
        return <ActivityIcon size={16} />;
      case "chatMessage":
      case "chatContextItem":
        return <TerminalIcon size={16} />;
      case "extension":
        return <PuzzleIcon size={16} />;
      case "analyticsPoint":
        return <BarChartIcon size={16} />;
      case "settingItem":
        return <SettingsIcon size={16} />;
      default:
        return <PanelRightIcon size={16} />;
    }
  };

  const handleKillProcess = async (pid: number) => {
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await killProcess(pid);
      setActionFeedback(`Killed PID ${pid}`);
      await telemetryCoordinator.refreshNow();
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleLaunchApp = async (app: { id?: string; exe_path?: string; location?: string; name: string }) => {
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await appsStore.launch({ id: app.id || app.name, exe_path: app.exe_path, location: app.location, name: app.name });
      setActionFeedback(`Launched ${app.name}`);
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleUninstallApp = async (app: { id?: string; uninstall_string?: string; name: string }) => {
    if (!app.uninstall_string) return;
    if (!window.confirm(`Launch uninstaller for ${app.name}?`)) return;
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await appsStore.uninstall({ id: app.id || app.name, uninstall_string: app.uninstall_string, name: app.name });
      setActionFeedback(`Uninstaller launched for ${app.name}`);
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleToggleStartup = async (name: string, currentEnabled: boolean) => {
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await toggleStartupApp(name, !currentEnabled);
      setActionFeedback(`Updated startup ${name}`);
      await telemetryCoordinator.refreshNow();
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRemoveStartup = async (name: string) => {
    if (!window.confirm(`Remove ${name} from startup?`)) return;
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await removeStartupApp(name);
      setActionFeedback(`Removed ${name}`);
      await telemetryCoordinator.refreshNow();
      uiStore.setSelectedItem(null, false);
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSwitchTarget = async (machineId: string) => {
    setActionInProgress(true);
    setActionFeedback(null);
    try {
      await networkStore.switchTarget(machineId);
      setActionFeedback(`Switched to node ${machineId}`);
    } catch (err: unknown) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const renderContextActions = () => {
    if (!selectedItem) return null;
    const { type, data } = selectedItem;

    if (type === "process") {
      const pid = Number(data.pid);
      if (isNaN(pid)) return null;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => handleKillProcess(pid)}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "7px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>{actionInProgress ? "Terminating..." : "Terminate Process"}</span>
          </button>
        </div>
      );
    }

    if (type === "application") {
      const appName = String(data.name || "");
      const exePath = data.exe_path ? String(data.exe_path) : undefined;
      const location = data.location ? String(data.location) : undefined;
      const uninstallString = data.uninstall_string ? String(data.uninstall_string) : undefined;

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => handleLaunchApp({ name: appName, exe_path: exePath, location })}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "7px 12px",
              backgroundColor: "var(--color-accent)",
              border: "none",
              color: "var(--color-background)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <PlayIcon size={12} />
            <span>Launch Application</span>
          </button>
          {uninstallString && (
            <button
              type="button"
              onClick={() => handleUninstallApp({ name: appName, uninstall_string: uninstallString })}
              disabled={actionInProgress}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                padding: "6px 12px",
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                borderRadius: "var(--radius-sm)",
                fontSize: "11px",
                cursor: actionInProgress ? "wait" : "pointer",
              }}
            >
              <TrashIcon size={12} />
              <span>Launch Uninstaller</span>
            </button>
          )}
        </div>
      );
    }

    if (type === "startup") {
      const name = String(data.name || "");
      const isEnabled = data.enabled === "Enabled" || data.enabled === true;

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => handleToggleStartup(name, isEnabled)}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "7px 12px",
              backgroundColor: isEnabled ? "var(--color-surface-subtle)" : "var(--color-accent)",
              border: "1px solid var(--color-border)",
              color: isEnabled ? "var(--color-text)" : "var(--color-background)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <CheckIcon size={12} />
            <span>{isEnabled ? "Disable Startup" : "Enable Startup"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleRemoveStartup(name)}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Remove Startup Entry</span>
          </button>
        </div>
      );
    }

    if (type === "machine") {
      const machineId = String(selectedItem.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => handleSwitchTarget(machineId)}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "7px 12px",
              backgroundColor: "var(--color-accent)",
              border: "none",
              color: "var(--color-background)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <ServerIcon size={12} />
            <span>Set Active Target Machine</span>
          </button>
        </div>
      );
    }

    if (type === "pendingApproval") {
      const approvalId = String(data.command_id || data.id || selectedItem.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await guardianStore.authorize(approvalId);
                setActionFeedback(`Authorized ${approvalId}`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "7px 12px",
              backgroundColor: "var(--color-success, #059669)",
              border: "none",
              color: "#ffffff",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <CheckIcon size={12} />
            <span>Authorize Action</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await guardianStore.reject(approvalId);
                setActionFeedback(`Rejected ${approvalId}`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <CloseIcon size={12} />
            <span>Reject Action</span>
          </button>
        </div>
      );
    }

    if (type === "guardianAlert") {
      const pid = Number(data.pid);
      if (isNaN(pid)) return null;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await guardianStore.handleSecurityAction(pid, "trust");
                setActionFeedback(`Process trusted: PID ${pid}`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <ShieldIcon size={12} />
            <span>Trust Process</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await guardianStore.handleSecurityAction(pid, "mark_dangerous");
                setActionFeedback(`Marked dangerous: PID ${pid}`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Mark Dangerous</span>
          </button>
        </div>
      );
    }

    if (type === "trustedProcess") {
      const processName = String(data.processName || selectedItem.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await guardianStore.removeTrusted(processName);
                setActionFeedback(`Removed ${processName} from whitelist`);
                uiStore.setSelectedItem(null, false);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Remove from Whitelist</span>
          </button>
        </div>
      );
    }

    if (type === "memorySession") {
      const sessionId = String(data.id || selectedItem.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete conversation session ${sessionId}?`)) return;
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await memoryStore.removeSession(sessionId);
                setActionFeedback(`Deleted session ${sessionId}`);
                uiStore.setSelectedItem(null, false);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Delete Session Memory</span>
          </button>
        </div>
      );
    }

    if (type === "agentNode" || type === "terminalNode") {
      const tag = String(data.tag || selectedItem.id.replace("node-", ""));
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => {
              terminalStore.setAlterTarget(tag);
              setActionFeedback(`Set active terminal target to Agent [${tag}]`);
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-primary-subtle)",
              border: "1px solid var(--color-primary-border)",
              color: "var(--color-primary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <TerminalIcon size={12} />
            <span>Set Active Terminal Target</span>
          </button>
        </div>
      );
    }

    if (type === "chatMessage") {
      const content = String(data.content || "");
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(content);
              setActionFeedback("Message content copied to clipboard");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <CheckIcon size={12} />
            <span>Copy Message Text</span>
          </button>
        </div>
      );
    }

    if (type === "extension") {
      const intent = String(data.intent || selectedItem.id);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await extensionsStore.reload(intent);
                setActionFeedback(`Reloaded extension [${intent}]`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <RefreshCwIcon size={12} />
            <span>Reload in Runtime</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await extensionsStore.toggle(intent);
                setActionFeedback(`Toggled extension [${intent}]`);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: actionInProgress ? "wait" : "pointer",
            }}
          >
            <PlayIcon size={12} />
            <span>Toggle Active State</span>
          </button>
        </div>
      );
    }

    if (type === "analyticsPoint") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              setActionFeedback("Telemetry point JSON copied");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <CheckIcon size={12} />
            <span>Copy Telemetry JSON</span>
          </button>
        </div>
      );
    }

    return null;
  };

  const renderDataEntries = (data: Record<string, unknown>) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {Object.entries(data).map(([key, val]) => {
          let renderedValue = String(val);
          if (typeof val === "object" && val !== null) {
            renderedValue = JSON.stringify(val, null, 2);
          } else if (val === undefined || val === null) {
            renderedValue = "None";
          }

          return (
            <div
              key={key}
              style={{
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-xs)",
                padding: "var(--space-2) var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "var(--font-weight-bold)",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.5px",
                }}
              >
                {key.replace(/_/g, " ")}
              </span>
              <pre
                style={{
                  margin: 0,
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {renderedValue}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      role="complementary"
      aria-label="Contextual Inspector"
      style={{
        width: "var(--inspector-width)",
        backgroundColor: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <PanelRightIcon size={14} />
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wider)", color: "var(--color-text-secondary)", margin: 0 }}>
            Inspector
          </h2>
        </div>

        <button
          type="button"
          onClick={() => uiStore.setInspectorOpen(false)}
          title="Close Inspector"
          aria-label="Close Inspector"
          style={{
            width: "24px",
            height: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-subtle)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Content Canvas */}
      {selectedItem ? (
        <div style={{ flex: 1, padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--color-border-subtle)" }}>
            <span style={{ color: "var(--color-accent)", display: "flex" }}>
              {getItemIcon(selectedItem.type)}
            </span>
            <div>
              <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                {selectedItem.title}
              </h3>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Type: {selectedItem.type}
              </span>
            </div>
          </div>

          {/* Context Actions */}
          {renderContextActions()}

          {/* Action Feedback */}
          {actionFeedback && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: actionFeedback.startsWith("Error") ? "var(--color-danger-subtle)" : "var(--color-surface-elevated)",
                border: `1px solid ${actionFeedback.startsWith("Error") ? "var(--color-danger-border)" : "var(--color-accent)"}`,
                color: actionFeedback.startsWith("Error") ? "var(--color-danger)" : "var(--color-text)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {actionFeedback}
            </div>
          )}

          <div style={{ flex: 1, marginTop: "var(--space-1)" }}>
            {renderDataEntries(selectedItem.data)}
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "var(--space-2)",
            color: "var(--color-text-muted)",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PanelRightIcon size={16} />
          </div>
          <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-secondary)", margin: 0 }}>
            No Selection
          </h3>
          <p style={{ fontSize: "var(--font-size-xs)", maxWidth: "220px", lineHeight: 1.4, margin: 0 }}>
            Click on a process, installed app, startup entry, LAN node, or hardware sensor to inspect details and execute operations.
          </p>
        </div>
      )}

      {/* Footer Diagnostic Note */}
      <div
        style={{
          padding: "var(--space-2) var(--space-4)",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: "10px",
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface-subtle)",
        }}
      >
        {selectedItem ? `Item ID: ${selectedItem.id}` : "Contextual property binding active"}
      </div>
    </aside>
  );
};
