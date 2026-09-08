/**
 * Fluffy Desktop - FTP Server Settings View
 * 
 * Configures local FTP file-sharing server (Port 2121), credential generation,
 * connected client monitoring, QR code pairing, and activity logging.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect } from "react";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import {
  ServerIcon,
  PlayIcon,
  SquareIcon,
  RefreshCwIcon,
  FolderIcon,
  CheckIcon,
  TrashIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";

export const FtpSettingsView: React.FC = () => {
  const { ftpStatus, ftpLogs, loading, actionLoading, error, saveSuccessMessage } =
    useSettingsStore();

  const [sharedDir, setSharedDir] = useState<string>("");

  useEffect(() => {
    settingsStore.refreshFtpStatus();
    settingsStore.loadFtpLogs();
  }, []);

  const isRunning = ftpStatus?.status === "running";

  const handleToggleServer = async () => {
    if (isRunning) {
      await settingsStore.stopFtp();
    } else {
      await settingsStore.startFtp(sharedDir || undefined);
    }
  };

  const handleRefresh = async () => {
    await settingsStore.refreshFtpStatus();
    await settingsStore.loadFtpLogs();
  };

  const handleClearLogs = async () => {
    await settingsStore.clearFtpLogs();
  };

  const handleDisconnect = async (clientIp: string) => {
    await settingsStore.disconnectClient(clientIp);
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
            <ServerIcon size={18} />
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
              Local FTP Server
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              High-speed LAN file transfer bridge on port 2121.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {saveSuccessMessage && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--color-success)",
                backgroundColor: "var(--color-success-subtle)",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-success-border)",
              }}
            >
              <CheckIcon size={12} />
              {saveSuccessMessage}
            </span>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh FTP server status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: actionLoading ? "spin 1s linear infinite" : "none" }} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleToggleServer}
            disabled={actionLoading || loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: isRunning ? "var(--color-danger)" : "var(--color-success)",
              color: "#ffffff",
              border: "none",
              cursor: actionLoading || loading ? "not-allowed" : "pointer",
              opacity: actionLoading || loading ? 0.6 : 1,
            }}
          >
            {isRunning ? (
              <>
                <SquareIcon size={12} />
                <span>Stop Server</span>
              </>
            ) : (
              <>
                <PlayIcon size={12} />
                <span>Start Server</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Settings Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "780px", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
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

        {/* Server Status Panel */}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: isRunning ? "var(--color-success)" : "var(--color-text-muted)",
                }}
              />
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                Status: {isRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              Port: 2121 (TCP)
            </span>
          </div>

          {isRunning && ftpStatus && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "var(--space-3)",
                paddingTop: "var(--space-2)",
                borderTop: "1px solid var(--color-border-subtle)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ padding: "8px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)" }}>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block" }}>IP Address</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>{ftpStatus.ip}</span>
              </div>
              <div style={{ padding: "8px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)" }}>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block" }}>Username</span>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)" }}>{ftpStatus.username}</span>
              </div>
              <div style={{ padding: "8px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)" }}>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block" }}>Active Clients</span>
                <span style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)" }}>{ftpStatus.active_clients || 0}</span>
              </div>
            </div>
          )}

          {/* QR Code preview if available */}
          {isRunning && ftpStatus?.qr_code && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              <img
                src={ftpStatus.qr_code}
                alt="FTP Connection QR Code"
                style={{ width: "80px", height: "80px", borderRadius: "var(--radius-xs)", backgroundColor: "#ffffff", padding: "4px" }}
              />
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                <div style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>Mobile Quick Connect</div>
                <p style={{ fontSize: "11px", margin: "4px 0 0", lineHeight: 1.4 }}>
                  Scan this QR code with a mobile FTP client on the same Wi-Fi network to transfer files instantly.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Directory configuration */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: "6px" }}>
            <FolderIcon size={14} style={{ color: "var(--color-accent)" }} />
            Shared Storage Directory
          </label>
          <input
            type="text"
            value={sharedDir}
            disabled={isRunning}
            onChange={(e) => setSharedDir(e.target.value)}
            placeholder="Default (Downloads / Shared)"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
              opacity: isRunning ? 0.6 : 1,
            }}
          />
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0 }}>
            Specify a custom folder to serve over FTP. Server must be stopped before modifying directory path.
          </p>
        </div>

        {/* Activity Logs */}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", margin: 0 }}>
              Server Activity Logs ({ftpLogs.length})
            </h3>
            {ftpLogs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <TrashIcon size={11} />
                <span>Clear Logs</span>
              </button>
            )}
          </div>

          {ftpLogs.length === 0 ? (
            <div style={{ padding: "var(--space-4)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", backgroundColor: "var(--color-surface-elevated)", borderRadius: "var(--radius-xs)" }}>
              No FTP connection or transfer events recorded.
            </div>
          ) : (
            <div style={{ maxHeight: "180px", overflowY: "auto", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
              {ftpLogs.map((log, index) => (
                <div key={index} style={{ padding: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", borderBottom: index < ftpLogs.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>{log.timestamp}</span>
                    <span style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)" }}>{log.event}</span>
                    {log.client && <span style={{ color: "var(--color-text-muted)" }}>({log.client})</span>}
                    {log.file && <span style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.file}</span>}
                  </div>
                  {log.client && (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(log.client as string)}
                      style={{ fontSize: "10px", color: "var(--color-danger)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
