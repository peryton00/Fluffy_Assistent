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
import { telemetryCoordinator, useTelemetryStore } from "../../stores/telemetryStore";
import { appsStore } from "../../stores/appsStore";
import { guardianStore } from "../../stores/guardianStore";
import { memoryStore } from "../../stores/memoryStore";
import { terminalStore } from "../../stores/terminalStore";
import { extensionsStore } from "../../stores/extensionsStore";

export const Inspector: React.FC = () => {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const inspectorWidth = useUiStore((s) => s.inspectorWidth);
  const selectedItem = useUiStore((s) => s.selectedItem);
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = inspectorWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Left drag increases width since Inspector is docked on the right
      const delta = startX - moveEvent.clientX;
      uiStore.setInspectorWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

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
      case "runningApplication":
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
      uiStore.setSelectedItem(null, false);
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

    if (type === "runningApplication") {
      const children = (Array.isArray(data.children) ? data.children : []) as unknown as Array<{ pid: number; name: string }>;
      const childPids = children.map((c) => c.pid).filter((pid) => typeof pid === "number" && !isNaN(pid));
      const appName = String(data.name || selectedItem.title);

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={async () => {
              setActionInProgress(true);
              setActionFeedback(null);
              try {
                await Promise.allSettled(childPids.map((pid) => killProcess(pid)));
                setActionFeedback(`Terminated ${childPids.length} processes for ${appName}`);
                await telemetryCoordinator.refreshNow();
                uiStore.setSelectedItem(null, false);
              } catch (err) {
                setActionFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setActionInProgress(false);
              }
            }}
            disabled={actionInProgress || childPids.length === 0}
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
            <span>{actionInProgress ? "Terminating All..." : `Terminate All Processes (${childPids.length})`}</span>
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

  const resolveLiveInspectorData = (): { type: string; id: string; title: string; data: Record<string, unknown> } | null => {
    if (!selectedItem) return null;
    const { type, id, title, data } = selectedItem;

    // 1. CPU metric or Hardware CPU
    if (type === "cpu" || (type === "hardware" && id?.toLowerCase().includes("cpu"))) {
      const cpu = snapshot?.system?.cpu || snapshot?.cpu;
      if (cpu) {
        return {
          type: "cpu",
          id: id || "cpu",
          title: title || "CPU Telemetry",
          data: {
            usage_percent: cpu.usage_percent !== undefined ? `${Math.round(cpu.usage_percent)}%` : (data.usage_percent ?? "0%"),
            cores_count: cpu.cores_count ?? (cpu.cores_usage?.length || data.cores_count || 0),
            cores_usage: cpu.cores_usage && cpu.cores_usage.length > 0 ? cpu.cores_usage : (data.cores_usage ?? []),
            frequency_mhz: cpu.frequency_mhz ? `${cpu.frequency_mhz} MHz` : (data.frequency_mhz ?? "Dynamic"),
            brand: cpu.brand || data.brand || "Host Processor",
            physical_cores: cpu.physical_cores ?? data.physical_cores ?? (cpu.cores_usage?.length ? Math.ceil(cpu.cores_usage.length / 2) : "Unknown"),
            temperature: cpu.temperature !== undefined && cpu.temperature !== null ? `${cpu.temperature.toFixed(1)} °C` : "Sensor Not Available",
          },
        };
      }
    }

    // 2. RAM metric or Hardware RAM
    if (type === "ram" || (type === "hardware" && id?.toLowerCase().includes("ram"))) {
      const ram = snapshot?.system?.ram || snapshot?.ram;
      if (ram) {
        const percent = ram.usage_percent !== undefined
          ? ram.usage_percent
          : (ram.total_mb > 0 ? (ram.used_mb / ram.total_mb) * 100 : 0);
        return {
          type: "ram",
          id: id || "ram",
          title: title || "Memory (RAM)",
          data: {
            usage_percent: `${percent.toFixed(1)}%`,
            used_mb: `${ram.used_mb || 0} MB (${((ram.used_mb || 0) / 1024).toFixed(2)} GB)`,
            total_mb: `${ram.total_mb || 0} MB (${((ram.total_mb || 0) / 1024).toFixed(2)} GB)`,
            free_mb: `${ram.free_mb || 0} MB (${((ram.free_mb || 0) / 1024).toFixed(2)} GB)`,
          },
        };
      }
    }

    // 3. Disk metric or Hardware Disk
    if (type === "disk" || (type === "hardware" && (id?.toLowerCase().includes("disk") || id?.toLowerCase().includes("storage")))) {
      const disks = snapshot?.system?.disks || snapshot?.disks;
      if (disks && Array.isArray(disks) && disks.length > 0) {
        return {
          type: "disk",
          id: id || "disk",
          title: title || "Storage / Disks",
          data: {
            mounted_devices: disks.length,
            disks: disks.map((d) => {
              const usedPercent = d.used_percent !== undefined ? Math.round(d.used_percent) : 0;
              const totalGb = d.total_bytes ? (d.total_bytes / (1024 ** 3)).toFixed(1) : "0";
              const availGb = d.available_bytes ? (d.available_bytes / (1024 ** 3)).toFixed(1) : "0";
              return `${d.name || d.mount_point}: ${usedPercent}% Used (${availGb} GB available of ${totalGb} GB)`;
            }),
          },
        };
      }
    }

    // 4. Network metric or Hardware Network
    if (type === "network" || (type === "hardware" && id?.toLowerCase().includes("net"))) {
      const net = snapshot?.system?.network || (snapshot as unknown as { network?: Record<string, unknown> })?.network;
      if (net) {
        const rawNet = net as Record<string, unknown>;
        const bytesSent = typeof net.bytes_sent === "number" ? net.bytes_sent : (typeof rawNet.transmitted_kb === "number" ? (rawNet.transmitted_kb as number) * 1024 : undefined);
        const bytesRecv = typeof net.bytes_recv === "number" ? net.bytes_recv : (typeof rawNet.received_kb === "number" ? (rawNet.received_kb as number) * 1024 : undefined);
        const rxKbps = typeof net.total_rx_kbps === "number" ? net.total_rx_kbps : (typeof rawNet.total_rx_kbps === "number" ? (rawNet.total_rx_kbps as number) : 0);
        const txKbps = typeof net.total_tx_kbps === "number" ? net.total_tx_kbps : (typeof rawNet.total_tx_kbps === "number" ? (rawNet.total_tx_kbps as number) : 0);
        return {
          type: "network",
          id: id || "network",
          title: title || "Network Adapter",
          data: {
            status: net.status || (rawNet.connection_type as string) || "Connected",
            current_bandwidth: net.speed_mbps !== undefined ? `${net.speed_mbps} Mbps` : `${((rxKbps + txKbps) / 1000).toFixed(2)} Mbps`,
            download_rate: rxKbps > 0 ? `${rxKbps.toFixed(1)} KB/s` : "0.0 KB/s",
            upload_rate: txKbps > 0 ? `${txKbps.toFixed(1)} KB/s` : "0.0 KB/s",
            total_received: bytesRecv !== undefined ? `${(bytesRecv / (1024 * 1024)).toFixed(2)} MB` : "N/A",
            total_transmitted: bytesSent !== undefined ? `${(bytesSent / (1024 * 1024)).toFixed(2)} MB` : "N/A",
          },
        };
      }
    }

    // 5. Battery metric or Hardware Battery
    if (type === "battery" || (type === "hardware" && (id?.toLowerCase().includes("battery") || id?.toLowerCase().includes("power")))) {
      const bat = snapshot?.system?.battery || snapshot?.battery;
      if (bat) {
        const rawBat = bat as unknown as Record<string, unknown>;
        const isPlugged = rawBat.plugged ?? bat.is_charging;
        const hasBattery = bat.percent !== undefined && bat.percent > 0;
        return {
          type: "battery",
          id: id || "battery",
          title: title || "Battery / Power",
          data: {
            has_battery: hasBattery ? "Yes" : "No (Direct AC)",
            battery_percent: hasBattery ? `${Math.round(bat.percent)}%` : "100% (AC)",
            power_state: isPlugged ? "AC Connected / Charging" : "Discharging on Battery",
            time_remaining: bat.time_remaining_minutes ? `${bat.time_remaining_minutes} minutes` : "Optimal",
          },
        };
      }
    }

    // 6. Process
    if (type === "process") {
      const pid = Number(id || data.pid);
      const allProcs = snapshot?.system?.processes?.top_ram || snapshot?.system?.processes?.top_cpu || [];
      const currentProc = allProcs.find((p) => p.pid === pid);
      if (currentProc) {
        return {
          type: "process",
          id: String(currentProc.pid),
          title: `Process: ${currentProc.name}`,
          data: {
            pid: currentProc.pid,
            name: currentProc.name,
            cpu_percent: `${(currentProc.cpu_percent || 0).toFixed(1)}%`,
            ram_mb: currentProc.ram_mb >= 1024 ? `${(currentProc.ram_mb / 1024).toFixed(2)} GB` : `${Math.round(currentProc.ram_mb)} MB`,
            disk_read: `${currentProc.disk_read_kb || 0} KB`,
            disk_written: `${currentProc.disk_written_kb || 0} KB`,
            network_rx: `${(currentProc.net_received || 0).toFixed(1)} KB/s`,
            network_tx: `${(currentProc.net_sent || 0).toFixed(1)} KB/s`,
            parent_pid: currentProc.parent_pid ? currentProc.parent_pid : "Root Process",
            exe_path: currentProc.exe_path || data.exe_path || "N/A",
          },
        };
      }
    }

    // 7. Running Application (Aggregated parent + children)
    if (type === "runningApplication") {
      const rootPid = Number(data.root_pid);
      const appName = String(data.name || title || "").toLowerCase();
      const allProcs = snapshot?.system?.processes?.top_ram || [];
      const matching = allProcs.filter((p) => {
        if (rootPid && (p.pid === rootPid || p.parent_pid === rootPid)) return true;
        const pName = p.name.toLowerCase();
        const baseName = appName.replace(/\.exe$/i, "");
        return pName.includes(baseName) || baseName.includes(pName.replace(/\.exe$/i, ""));
      });

      if (matching.length > 0) {
        const totalCpu = matching.reduce((sum, p) => sum + (p.cpu_percent || 0), 0);
        const totalRam = matching.reduce((sum, p) => sum + (p.ram_mb || 0), 0);
        return {
          type: "runningApplication",
          id: id || `app-${appName}`,
          title: title || String(data.name || "Application"),
          data: {
            ...data,
            total_cpu: `${totalCpu.toFixed(1)}%`,
            total_ram: totalRam >= 1024 ? `${(totalRam / 1024).toFixed(2)} GB` : `${Math.round(totalRam)} MB`,
            children: matching,
          },
        };
      }
    }

    return selectedItem;
  };

  const renderRunningAppDetails = (data: Record<string, unknown>) => {
    const rootPid = Number(data.root_pid);
    const children = (Array.isArray(data.children) ? data.children : []) as unknown as Array<{
      pid: number;
      name: string;
      cpu_percent?: number;
      ram_mb?: number;
      status?: string;
      parent_pid?: number;
    }>;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {/* Summary Metadata Card */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
            backgroundColor: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3)",
          }}
        >
          <div>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
              Parent PID
            </span>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
              {rootPid || "N/A"}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
              Process Count
            </span>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
              {children.length}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
              Total CPU
            </span>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-accent)", marginTop: "2px" }}>
              {String(data.total_cpu || "0.0%")}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>
              Total RAM
            </span>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text)", marginTop: "2px" }}>
              {String(data.total_ram || "0 MB")}
            </div>
          </div>
        </div>

        {/* Linked Child Processes List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-secondary)" }}>
              Linked Child Processes ({children.length})
            </span>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
              Per-process control
            </span>
          </div>

          {children.length === 0 ? (
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-3)" }}>
              No child processes tracked.
            </div>
          ) : (
            children.map((child, idx) => {
              const isRoot = child.pid === rootPid || (idx === 0 && !child.parent_pid);
              const ramText = child.ram_mb !== undefined
                ? child.ram_mb >= 1024
                  ? `${(child.ram_mb / 1024).toFixed(1)} GB`
                  : `${Math.round(child.ram_mb)} MB`
                : "N/A";
              const cpuText = child.cpu_percent !== undefined ? `${child.cpu_percent.toFixed(1)}%` : "0.0%";

              return (
                <div
                  key={child.pid}
                  style={{
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-xs)",
                    padding: "var(--space-2) var(--space-3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: "var(--font-weight-bold)",
                          color: "var(--color-text)",
                        }}
                      >
                        PID {child.pid}
                      </span>
                      <span
                        style={{
                          fontSize: "9px",
                          padding: "1px 4px",
                          borderRadius: "var(--radius-xs)",
                          backgroundColor: isRoot ? "rgba(99, 102, 241, 0.15)" : "var(--color-surface-subtle)",
                          color: isRoot ? "var(--color-accent)" : "var(--color-text-muted)",
                          border: `1px solid ${isRoot ? "rgba(99, 102, 241, 0.3)" : "var(--color-border-subtle)"}`,
                          fontWeight: "var(--font-weight-medium)",
                        }}
                      >
                        {isRoot ? "Parent" : "Child"}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={actionInProgress}
                      onClick={() => handleKillProcess(child.pid)}
                      title={`End process PID ${child.pid}`}
                      style={{
                        padding: "2px 6px",
                        fontSize: "10px",
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--color-text-muted)",
                        cursor: actionInProgress ? "wait" : "pointer",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-danger)";
                        e.currentTarget.style.borderColor = "var(--color-danger-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--color-text-muted)";
                        e.currentTarget.style.borderColor = "var(--color-border)";
                      }}
                    >
                      End
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                      {child.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>CPU: {cpuText}</span>
                      <span>RAM: {ramText}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderDataEntries = (data: Record<string, unknown>) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {Object.entries(data).map(([key, val]) => {
          // Special rich render for CPU Core usage distribution
          if (key === "cores_usage" && Array.isArray(val)) {
            const hasCores = val.length > 0;
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
                  gap: "6px",
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
                  Cores Usage ({val.length} Cores)
                </span>
                {hasCores ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
                      gap: "6px",
                      marginTop: "2px",
                    }}
                  >
                    {val.map((usage: unknown, idx: number) => {
                      const num = typeof usage === "number" ? Math.round(usage) : 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: "var(--color-surface)",
                            padding: "4px 6px",
                            borderRadius: "var(--radius-xs)",
                            border: "1px solid var(--color-border-subtle)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-muted)" }}>
                            <span>C{idx + 1}</span>
                            <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>{num}%</span>
                          </div>
                          <div
                            style={{
                              width: "100%",
                              height: "3px",
                              backgroundColor: "var(--color-surface-subtle)",
                              borderRadius: "2px",
                              overflow: "hidden",
                              marginTop: "3px",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, num))}%`,
                                height: "100%",
                                backgroundColor: num > 85 ? "var(--color-danger)" : "var(--color-accent)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    No per-core telemetry recorded
                  </span>
                )}
              </div>
            );
          }

          // Special render for string arrays (e.g. disk mounts, logs, etc.)
          if (Array.isArray(val)) {
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
                  gap: "4px",
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
                {val.length === 0 ? (
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    None
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {val.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-text)",
                          padding: "2px 4px",
                          backgroundColor: "var(--color-surface)",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--color-border-subtle)",
                          wordBreak: "break-all",
                        }}
                      >
                        {typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          let renderedValue = String(val);
          const isNone = val === undefined || val === null || val === "None" || val === "" || val === "null";

          if (typeof val === "object" && val !== null) {
            renderedValue = JSON.stringify(val, null, 2);
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
              {isNone ? (
                <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                  —
                </span>
              ) : (
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
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const activeItem = resolveLiveInspectorData();

  return (
    <aside
      role="complementary"
      aria-label="Contextual Inspector"
      style={{
        width: `${inspectorWidth}px`,
        minWidth: `${inspectorWidth}px`,
        maxWidth: `${inspectorWidth}px`,
        backgroundColor: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        position: "relative",
      }}
    >
      {/* VS Code-style Resize Sash */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Inspector"
        title="Drag to resize inspector (Double-click to reset)"
        onMouseDown={handleMouseDown}
        onDoubleClick={() => uiStore.resetInspectorWidth()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: "absolute",
          top: 0,
          left: "-3px",
          width: "6px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 40,
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "2px",
            height: "100%",
            backgroundColor: (isDragging || isHovered) ? "var(--color-accent)" : "transparent",
            transition: "background-color 150ms ease",
          }}
        />
      </div>

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
      {activeItem ? (
        <div style={{ flex: 1, padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--color-border-subtle)" }}>
            <span style={{ color: "var(--color-accent)", display: "flex" }}>
              {getItemIcon(activeItem.type)}
            </span>
            <div>
              <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
                {activeItem.title}
              </h3>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Type: {activeItem.type}
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
            {activeItem.type === "runningApplication"
              ? renderRunningAppDetails(activeItem.data)
              : renderDataEntries(activeItem.data)}
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
