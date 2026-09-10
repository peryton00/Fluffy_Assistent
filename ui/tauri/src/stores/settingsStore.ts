/**
 * Fluffy Desktop - Settings Store
 * 
 * Centralized coordinator for application configuration, LLM/OpenRouter keys,
 * FTP server controls, Voice preferences, and system maintenance actions.
 */

import { useSyncExternalStore } from "react";
import {
  fetchLlmConfig,
  updateLlmConfig,
  fetchLlmModels,
  fetchUserPreferences,
  saveUserPreferences,
  executeNormalize,
  clearGuardianThreats,
  resetSessionContext,
} from "../services/api/settings";
import {
  fetchFtpStatus,
  startFtpServer,
  stopFtpServer,
  fetchFtpLogs,
  clearFtpLogs,
  disconnectFtpClient,
} from "../services/api/ftp";
import { uiStore } from "./uiStore";
import type {
  LlmConfig,
  LlmModelSummary,
  FtpStatusResponse,
  FtpLogEntry,
  GeneralSettingsState,
} from "../types/contracts";

export interface SettingsState {
  general: GeneralSettingsState;
  llmConfig: LlmConfig | null;
  llmModels: LlmModelSummary[];
  ftpStatus: FtpStatusResponse | null;
  ftpLogs: FtpLogEntry[];
  loading: boolean;
  actionLoading: boolean;
  error: Error | null;
  saveSuccessMessage: string | null;
  lastFetched: number | null;
}

class SettingsStoreManager {
  private state: SettingsState = {
    general: {
      theme: "fluffyDark",
      autoNormalize: false,
      alertThreshold: 0.7,
      voiceSpeed: 1.0,
      ttsMuted: false,
      reducedMotion: false,
    },
    llmConfig: null,
    llmModels: [],
    ftpStatus: null,
    ftpLogs: [],
    loading: false,
    actionLoading: false,
    error: null,
    saveSuccessMessage: null,
    lastFetched: null,
  };

  private listeners = new Set<() => void>();

  public getState(): SettingsState {
    return this.state;
  }

  private setState(partial: Partial<SettingsState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public clearFeedback = (): void => {
    this.setState({ error: null, saveSuccessMessage: null });
  };

  /**
   * Loads all configuration from backend APIs.
   */
  public loadAllSettings = async (force = false): Promise<void> => {
    if (!force && this.state.lastFetched && Date.now() - this.state.lastFetched < 30000) {
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const [prefsResult, llmConfResult, modelsResult, ftpStatResult] = await Promise.allSettled([
        fetchUserPreferences(),
        fetchLlmConfig(),
        fetchLlmModels(),
        fetchFtpStatus(),
      ]);

      const updatedGeneral = { ...this.state.general };

      if (prefsResult.status === "fulfilled" && prefsResult.value) {
        const p = prefsResult.value;
        if (p.theme === "fluffyDark" || p.theme === "fluffyLight" || p.theme === "transparent" || p.theme === "highContrast") {
          updatedGeneral.theme = p.theme;
        }
        if (typeof p.auto_normalize === "boolean") {
          updatedGeneral.autoNormalize = p.auto_normalize;
        }
        if (typeof p.alert_threshold === "number") {
          updatedGeneral.alertThreshold = p.alert_threshold;
        }
        if (typeof p.voice_speed === "number") {
          updatedGeneral.voiceSpeed = p.voice_speed;
        }
      }

      const llmConfig =
        llmConfResult.status === "fulfilled" && llmConfResult.value?.ok
          ? llmConfResult.value.config || null
          : null;

      const llmModels =
        modelsResult.status === "fulfilled" && Array.isArray(modelsResult.value)
          ? modelsResult.value
          : [];

      const ftpStatus =
        ftpStatResult.status === "fulfilled" ? ftpStatResult.value : null;

      this.setState({
        general: updatedGeneral,
        llmConfig,
        llmModels,
        ftpStatus,
        loading: false,
        error: null,
        lastFetched: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Updates general settings in store and persists to backend memory.
   */
  public updateGeneralSettings = async (
    updates: Partial<GeneralSettingsState>
  ): Promise<boolean> => {
    const newGeneral = { ...this.state.general, ...updates };
    this.setState({ general: newGeneral, actionLoading: true, error: null });

    // Sync theme with global uiStore
    if (updates.theme && updates.theme !== uiStore.getState().theme) {
      uiStore.setThemeMode(updates.theme);
    }

    try {
      await saveUserPreferences({
        theme: newGeneral.theme,
        auto_normalize: newGeneral.autoNormalize,
        alert_threshold: newGeneral.alertThreshold,
        voice_speed: newGeneral.voiceSpeed,
      });

      this.setState({
        actionLoading: false,
        saveSuccessMessage: "Settings saved successfully",
      });
      return true;
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Updates OpenRouter / LLM configuration.
   */
  public saveLlmSettings = async (
    apiKey?: string,
    model?: string
  ): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await updateLlmConfig({ api_key: apiKey, model });
      if (res.ok && res.config) {
        this.setState({
          llmConfig: res.config,
          actionLoading: false,
          saveSuccessMessage: "Model configuration updated",
        });
        return true;
      } else {
        this.setState({
          actionLoading: false,
          error: new Error(res.error || "Failed to update LLM configuration"),
        });
        return false;
      }
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Starts the FTP server.
   */
  public startFtp = async (sharedDir?: string): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await startFtpServer(sharedDir);
      if (res.success || res.status === "running") {
        await this.refreshFtpStatus();
        this.setState({
          actionLoading: false,
          saveSuccessMessage: "FTP Server started on port 2121",
        });
        return true;
      } else {
        this.setState({
          actionLoading: false,
          error: new Error(res.error || "Failed to start FTP server"),
        });
        return false;
      }
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Stops the FTP server.
   */
  public stopFtp = async (): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      await stopFtpServer();
      await this.refreshFtpStatus();
      this.setState({
        actionLoading: false,
        saveSuccessMessage: "FTP Server stopped",
      });
      return true;
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Refreshes FTP status and active client connections.
   */
  public refreshFtpStatus = async (): Promise<void> => {
    try {
      const status = await fetchFtpStatus();
      this.setState({ ftpStatus: status });
    } catch {
      // Ignored
    }
  };

  /**
   * Fetches FTP server activity logs.
   */
  public loadFtpLogs = async (): Promise<void> => {
    try {
      const logs = await fetchFtpLogs();
      this.setState({ ftpLogs: logs });
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Clears FTP server logs.
   */
  public clearFtpLogs = async (): Promise<boolean> => {
    try {
      const res = await clearFtpLogs();
      if (res.ok) {
        this.setState({ ftpLogs: [] });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  /**
   * Disconnects a client connected to FTP.
   */
  public disconnectClient = async (clientIp: string): Promise<boolean> => {
    try {
      const res = await disconnectFtpClient(clientIp);
      if (res.ok) {
        await this.refreshFtpStatus();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  /**
   * Normalizes system resources.
   */
  public runNormalization = async (): Promise<{ ok: boolean; message: string }> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await executeNormalize();
      this.setState({ actionLoading: false });
      if (res.ok) {
        const freed = res.memory_freed_mb ? `${res.memory_freed_mb} MB freed` : "Resources optimized";
        return { ok: true, message: `System normalized: ${freed}` };
      }
      return { ok: false, message: res.error || "Normalization completed with warnings" };
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return { ok: false, message: "Normalization failed" };
    }
  };

  /**
   * Clears guardian alerts and threat cache.
   */
  public clearGuardian = async (): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await clearGuardianThreats();
      this.setState({ actionLoading: false });
      return res.ok;
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Resets active session context.
   */
  public resetSession = async (): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await resetSessionContext();
      this.setState({ actionLoading: false });
      return res.ok;
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };
}

export const settingsStore = new SettingsStoreManager();

/**
 * React hook for consuming Settings state.
 */
export function useSettingsStore<T = SettingsState>(
  selector: (state: SettingsState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(settingsStore.getState());
  return useSyncExternalStore(
    settingsStore.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot
  );
}
