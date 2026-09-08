/**
 * Fluffy Desktop - Logs Store & 5-Second Polling Coordinator
 * 
 * Single authoritative coordinator for GET /logs.
 * Polling cadence is strictly 5,000ms as per system specification.
 * Supports manual pause/resume, on-demand refresh, and zero duplicate timers.
 */

import { useSyncExternalStore } from "react";
import { fetchLogs } from "../services/api/operations";
import type { ExecutionLog } from "../types/contracts";

export interface LogsState {
  logs: ExecutionLog[];
  loading: boolean;
  error: Error | null;
  lastUpdated: number | null;
  isPolling: boolean;
  isPaused: boolean;
}

const LOGS_POLL_INTERVAL_MS = 5000;

class LogsCoordinator {
  private state: LogsState = {
    logs: [],
    loading: false,
    error: null,
    lastUpdated: null,
    isPolling: false,
    isPaused: false,
  };

  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private inFlightController: AbortController | null = null;
  private isExecutingPoll = false;

  public getState(): LogsState {
    return this.state;
  }

  private setState(partial: Partial<LogsState>): void {
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
   * Starts the 5-second logs polling loop.
   */
  public start = (): void => {
    if (this.state.isPolling) {
      return;
    }

    this.setState({ isPolling: true });
    this.scheduleNext(0);
  };

  /**
   * Stops logs polling and cancels active request.
   */
  public stop = (): void => {
    if (!this.state.isPolling) {
      return;
    }

    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.inFlightController) {
      this.inFlightController.abort();
      this.inFlightController = null;
    }

    this.setState({ isPolling: false, loading: false });
  };

  /**
   * Toggles pause state. When paused, polling continues in background but new logs are buffered or paused.
   */
  public togglePause = (): void => {
    this.setState({ isPaused: !this.state.isPaused });
  };

  public setPaused = (isPaused: boolean): void => {
    this.setState({ isPaused });
  };

  /**
   * Clears the current log view in memory.
   */
  public clearLogs = (): void => {
    this.setState({ logs: [] });
  };

  /**
   * Triggers an immediate log fetch.
   */
  public refreshNow = async (): Promise<void> => {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    await this.pollOnce();
    if (this.state.isPolling) {
      this.scheduleNext();
    }
  };

  private scheduleNext(delayMs?: number): void {
    if (!this.state.isPolling) {
      return;
    }

    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const interval = delayMs !== undefined ? delayMs : LOGS_POLL_INTERVAL_MS;

    this.timerId = setTimeout(() => {
      this.pollOnce().finally(() => {
        if (this.state.isPolling) {
          this.scheduleNext();
        }
      });
    }, interval);
  }

  private async pollOnce(): Promise<void> {
    if (this.isExecutingPoll) {
      return;
    }

    // If paused by user, skip updating view logs
    if (this.state.isPaused) {
      return;
    }

    this.isExecutingPoll = true;
    this.inFlightController = new AbortController();

    if (this.state.logs.length === 0) {
      this.setState({ loading: true });
    }

    try {
      const logs = await fetchLogs({
        signal: this.inFlightController.signal,
        timeoutMs: 4000,
      });

      const now = Date.now();
      this.setState({
        logs: Array.isArray(logs) ? logs : [],
        loading: false,
        error: null,
        lastUpdated: now,
      });
    } catch (err: unknown) {
      if (this.inFlightController?.signal.aborted) {
        return;
      }

      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      this.inFlightController = null;
      this.isExecutingPoll = false;
    }
  }
}

export const logsCoordinator = new LogsCoordinator();

/**
 * Standard React hook to subscribe to logs state.
 */
export function useLogsStore<T = LogsState>(
  selector: (state: LogsState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(logsCoordinator.getState());
  return useSyncExternalStore(logsCoordinator.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
