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
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
} from "../../../components/common/Icons";

export const FtpSettingsView: React.FC = () => {
  const { ftpStatus, ftpLogs, loading, actionLoading, error, saveSuccessMessage } =
    useSettingsStore();

  const [sharedDir, setSharedDir] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    settingsStore.refreshFtpStatus();
    settingsStore.loadFtpLogs();
  }, []);

  useEffect(() => {
    if (ftpStatus?.shared_dir && !sharedDir) {
      setSharedDir(ftpStatus.shared_dir);
    }
  }, [ftpStatus?.shared_dir]);

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

  const handleBrowseFolder = async () => {
    if (isRunning) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Shared Folder for FTP Server",
      });
      if (typeof selected === "string" && selected.trim()) {
        setSharedDir(selected.trim());
      }
    } catch (err) {
      console.warn("Folder picker error or running in web mode:", err);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const ftpUrl = ftpStatus?.ip
    ? `ftp://${ftpStatus.username || "fluffy"}:${ftpStatus.password || ""}@${ftpStatus.ip}:${ftpStatus.port || 2121}`
    : "";

  const qrImageSrc = ftpStatus?.qr_code
    ? ftpStatus.qr_code.startsWith("data:")
      ? ftpStatus.qr_code
      : `data:image/png;base64,${ftpStatus.qr_code}`
    : null;

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

          {copiedField && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--color-accent)",
                backgroundColor: "var(--color-accent-subtle)",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-accent-border)",
              }}
            >
              <CheckIcon size={12} />
              {copiedField} copied
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

        {/* Server Status & Credentials Panel */}
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
                Status: {isRunning ? "Running (Listening on LAN)" : "Stopped"}
              </span>
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              Port: {ftpStatus?.port || 2121} (TCP)
            </span>
          </div>

          {isRunning && ftpStatus && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--space-3)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--color-border-subtle)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {/* Host / IP */}
              <div style={{ padding: "10px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>Host / IP</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(ftpStatus.ip, "Host IP")}
                    title="Copy IP"
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "2px" }}
                  >
                    <CopyIcon size={12} />
                  </button>
                </div>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)", fontSize: "13px" }}>{ftpStatus.ip}</span>
              </div>

              {/* Username */}
              <div style={{ padding: "10px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>Username</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(ftpStatus.username || "fluffy", "Username")}
                    title="Copy Username"
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "2px" }}
                  >
                    <CopyIcon size={12} />
                  </button>
                </div>
                <span style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-bold)", fontSize: "13px" }}>{ftpStatus.username || "fluffy"}</span>
              </div>

              {/* Password */}
              <div style={{ padding: "10px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>Password</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide Password" : "Show Password"}
                      style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "2px" }}
                    >
                      {showPassword ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                    </button>
                    {ftpStatus.password && (
                      <button
                        type="button"
                        onClick={() => handleCopy(ftpStatus.password || "", "Password")}
                        title="Copy Password"
                        style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "2px" }}
                      >
                        <CopyIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)", fontSize: "13px", letterSpacing: showPassword ? "normal" : "2px" }}>
                  {ftpStatus.password ? (showPassword ? ftpStatus.password : "••••••••") : "(No password set)"}
                </span>
              </div>

              {/* Active Clients */}
              <div style={{ padding: "10px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: "var(--font-weight-bold)" }}>Connected Clients</span>
                <span style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-bold)", fontSize: "13px" }}>
                  {ftpStatus.active_clients || ftpStatus.connected_clients || 0}
                </span>
              </div>
            </div>
          )}

          {/* Quick Connect URL Banner */}
          {isRunning && ftpStatus && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                URL: <strong style={{ color: "var(--color-text)" }}>ftp://{ftpStatus.ip}:{ftpStatus.port || 2121}</strong>
              </span>
              <button
                type="button"
                onClick={() => handleCopy(`ftp://${ftpStatus.ip}:${ftpStatus.port || 2121}`, "FTP URL")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  fontSize: "10px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                <CopyIcon size={11} />
                <span>Copy URL</span>
              </button>
            </div>
          )}

          {/* QR Code preview */}
          {isRunning && qrImageSrc && (
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
                src={qrImageSrc}
                alt="FTP Connection QR Code"
                style={{
                  width: "96px",
                  height: "96px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "#ffffff",
                  padding: "6px",
                  flexShrink: 0,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              />
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                <div style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-text)", fontSize: "12px" }}>
                  Mobile Quick Connect QR
                </div>
                <p style={{ fontSize: "11px", margin: "4px 0 0", lineHeight: 1.4 }}>
                  Scan this QR code with any mobile FTP client (e.g. AndFTP, FTPManager, Documents) on the same Wi-Fi network to authenticate and transfer files instantly.
                </p>
                {ftpUrl && (
                  <button
                    type="button"
                    onClick={() => handleCopy(ftpUrl, "Full Connection URI")}
                    style={{
                      marginTop: "6px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 6px",
                      fontSize: "10px",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <CopyIcon size={10} />
                    <span>Copy Full Credentials URI</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Directory configuration with Native Folder Picker */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={sharedDir}
              disabled={isRunning}
              onChange={(e) => setSharedDir(e.target.value)}
              placeholder="Default (Downloads / Shared)"
              style={{
                flex: 1,
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
            <button
              type="button"
              disabled={isRunning}
              onClick={handleBrowseFolder}
              title={isRunning ? "Stop server to change folder" : "Browse local folders"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                cursor: isRunning ? "not-allowed" : "pointer",
                opacity: isRunning ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              <FolderIcon size={12} />
              <span>Browse...</span>
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0 }}>
            {isRunning
              ? "Server is active. To change the shared folder, stop the server first."
              : "Select or enter a custom folder on your system to serve over FTP. If left blank, Fluffy's default shared folder is used."}
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
