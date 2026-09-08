/**
 * Fluffy Desktop - Guardian Store
 * 
 * Centralized state coordinator for Guardian security, policy, authorizations,
 * and trusted processes. Reuses the global telemetry coordinator for live alerts,
 * pending confirmations, and anomaly verdicts.
 */

import { useSyncExternalStore } from "react";
import {
  confirmApproval,
  cancelApproval,
  executeSecurityAction,
  fetchTrustedProcesses,
  addTrustedProcess,
  removeTrustedProcess,
  clearGuardianRecognition,
} from "../services/api/guardian";
import { telemetryCoordinator } from "./telemetryStore";
import type { SecurityActionType } from "../types/contracts";

export interface GuardianState {
  trustedProcesses: string[];
  loading: boolean;
  inFlightApprovals: Record<string, "authorizing" | "rejecting">;
  inFlightSecurityActions: Record<number, SecurityActionType>;
  error: Error | null;
  lastFetched: number | null;
}

class GuardianStoreManager {
  private state: GuardianState = {
    trustedProcesses: [],
    loading: false,
    inFlightApprovals: {},
    inFlightSecurityActions: {},
    error: null,
    lastFetched: null,
  };

  private listeners = new Set<() => void>();
  private inFlightTrustedPromise: Promise<string[]> | null = null;

  public getState(): GuardianState {
    return this.state;
  }

  private setState(partial: Partial<GuardianState>): void {
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

  /**
   * Loads trusted processes from backend memory.
   */
  public loadTrustedProcesses = async (force: boolean = false): Promise<void> => {
    if (!force && this.state.trustedProcesses.length > 0) {
      return;
    }

    if (this.inFlightTrustedPromise) {
      await this.inFlightTrustedPromise;
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      this.inFlightTrustedPromise = fetchTrustedProcesses();
      const trusted = await this.inFlightTrustedPromise;
      this.setState({
        trustedProcesses: Array.isArray(trusted) ? trusted : [],
        loading: false,
        error: null,
        lastFetched: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      this.inFlightTrustedPromise = null;
    }
  };

  /**
   * Adds a process to trusted memory and reloads.
   */
  public trustProcess = async (processName: string): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      await addTrustedProcess(processName);
      await this.loadTrustedProcesses(true);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  public addTrusted = async (processName: string): Promise<void> => {
    return this.trustProcess(processName);
  };

  /**
   * Removes a process from trusted memory.
   */
  public untrustProcess = async (processName: string): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      await removeTrustedProcess(processName);
      await this.loadTrustedProcesses(true);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  public removeTrusted = async (processName: string): Promise<void> => {
    return this.untrustProcess(processName);
  };

  /**
   * Authorizes a pending approval command.
   */
  public authorize = async (commandId: string): Promise<void> => {
    this.setState({
      inFlightApprovals: { ...this.state.inFlightApprovals, [commandId]: "authorizing" },
      error: null,
    });

    try {
      await confirmApproval(commandId);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    } finally {
      const next = { ...this.state.inFlightApprovals };
      delete next[commandId];
      this.setState({ inFlightApprovals: next });
    }
  };

  /**
   * Rejects/cancels a pending approval command.
   */
  public reject = async (commandId: string): Promise<void> => {
    this.setState({
      inFlightApprovals: { ...this.state.inFlightApprovals, [commandId]: "rejecting" },
      error: null,
    });

    try {
      await cancelApproval(commandId);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    } finally {
      const next = { ...this.state.inFlightApprovals };
      delete next[commandId];
      this.setState({ inFlightApprovals: next });
    }
  };

  /**
   * Executes a security action on a PID.
   */
  public takeSecurityAction = async (
    pid: number,
    action: SecurityActionType
  ): Promise<void> => {
    this.setState({
      inFlightSecurityActions: { ...this.state.inFlightSecurityActions, [pid]: action },
      error: null,
    });

    try {
      await executeSecurityAction(pid, action);
      if (action === "trust") {
        await this.loadTrustedProcesses(true);
      }
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    } finally {
      const next = { ...this.state.inFlightSecurityActions };
      delete next[pid];
      this.setState({ inFlightSecurityActions: next });
    }
  };

  public handleSecurityAction = async (
    pid: number,
    action: SecurityActionType
  ): Promise<void> => {
    return this.takeSecurityAction(pid, action);
  };

  /**
   * Clears all Guardian baselines and resets detector state.
   */
  public clearBaselines = async (): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      await clearGuardianRecognition();
      await this.loadTrustedProcesses(true);
      await telemetryCoordinator.refreshNow();
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  public resetRecognition = async (): Promise<void> => {
    return this.clearBaselines();
  };
}

export const guardianStore = new GuardianStoreManager();

export type ExtendedGuardianState = GuardianState & {
  loadTrustedProcesses: (force?: boolean) => Promise<void>;
  trustProcess: (processName: string) => Promise<void>;
  addTrusted: (processName: string) => Promise<void>;
  untrustProcess: (processName: string) => Promise<void>;
  removeTrusted: (processName: string) => Promise<void>;
  authorize: (commandId: string) => Promise<void>;
  reject: (commandId: string) => Promise<void>;
  takeSecurityAction: (pid: number, action: SecurityActionType) => Promise<void>;
  handleSecurityAction: (pid: number, action: SecurityActionType) => Promise<void>;
  clearBaselines: () => Promise<void>;
  resetRecognition: () => Promise<void>;
};

let lastRawGuardianState: GuardianState | null = null;
let cachedEnrichedGuardianState: ExtendedGuardianState | null = null;

function getEnrichedGuardianState(): ExtendedGuardianState {
  const raw = guardianStore.getState();
  if (raw === lastRawGuardianState && cachedEnrichedGuardianState !== null) {
    return cachedEnrichedGuardianState;
  }
  lastRawGuardianState = raw;
  cachedEnrichedGuardianState = {
    ...raw,
    loadTrustedProcesses: guardianStore.loadTrustedProcesses,
    trustProcess: guardianStore.trustProcess,
    addTrusted: guardianStore.addTrusted,
    untrustProcess: guardianStore.untrustProcess,
    removeTrusted: guardianStore.removeTrusted,
    authorize: guardianStore.authorize,
    reject: guardianStore.reject,
    takeSecurityAction: guardianStore.takeSecurityAction,
    handleSecurityAction: guardianStore.handleSecurityAction,
    clearBaselines: guardianStore.clearBaselines,
    resetRecognition: guardianStore.resetRecognition,
  };
  return cachedEnrichedGuardianState;
}

/**
 * React hook for consuming Guardian state.
 */
export function useGuardianStore(): ExtendedGuardianState {
  return useSyncExternalStore(
    guardianStore.subscribe,
    getEnrichedGuardianState,
    getEnrichedGuardianState
  );
}
