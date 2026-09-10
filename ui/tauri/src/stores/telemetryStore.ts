/**
 * Fluffy Desktop - Central Telemetry Store & Polling Coordinator
 * 
 * Single authoritative coordinator for GET /status.
 * Subscribes all UI features to a unified telemetry stream without duplicate polling.
 * Implements adaptive polling: ACTIVE (~2,000ms) vs IDLE (~10,000ms).
 */

import { useSyncExternalStore } from "react";
import { fetchStatus, fetchSystemDisks } from "../services/api/status";
import { ApiClientError } from "../services/api/client";
import type { TelemetrySnapshot, DiskTelemetry } from "../types/contracts";
import type { ConnectionState, ActivityState } from "../types/ui";

export interface TelemetryState {
  snapshot: TelemetrySnapshot | null;
  loading: boolean;
  error: Error | ApiClientError | null;
  connectionState: ConnectionState;
  lastUpdated: number | null;
  lastError: number | null;
  isPolling: boolean;
  activityState: ActivityState;
}

const ACTIVE_INTERVAL_MS = 2000;
const IDLE_INTERVAL_MS = 10000;
const STALE_THRESHOLD_MS = 15000;

class TelemetryCoordinator {
  private state: TelemetryState = {
    snapshot: null,
    loading: false,
    error: null,
    connectionState: "CONNECTING",
    lastUpdated: null,
    lastError: null,
    isPolling: false,
    activityState: "ACTIVE",
  };

  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private inFlightController: AbortController | null = null;
  private isExecutingPoll = false;
  private disksCache: DiskTelemetry[] = [];
  private lastDisksScan = 0;

  public getState(): TelemetryState {
    return this.state;
  }

  private setState(partial: Partial<TelemetryState>): void {
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
   * Starts the single centralized telemetry polling loop.
   */
  public start = (): void => {
    if (this.state.isPolling) {
      return;
    }

    this.setState({ isPolling: true });
    this.scheduleNext(0);
  };

  /**
   * Stops polling and aborts any active in-flight request.
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
   * Changes the activity state to dynamically adapt polling cadence.
   */
  public setActivityState = (activityState: ActivityState): void => {
    if (this.state.activityState === activityState) {
      return;
    }

    this.setState({ activityState });

    // If currently running in idle and switching to active, reschedule immediately
    if (this.state.isPolling && activityState === "ACTIVE" && !this.isExecutingPoll) {
      if (this.timerId !== null) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.scheduleNext(0);
    }
  };

  /**
   * Triggers an immediate status refresh on-demand.
   */
  public refreshNow = async (): Promise<void> => {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    // Force immediate disk scan on explicit refresh
    this.lastDisksScan = 0;
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

    const interval = delayMs !== undefined
      ? delayMs
      : (this.state.activityState === "ACTIVE" ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);

    this.timerId = setTimeout(() => {
      this.pollOnce().finally(() => {
        if (this.state.isPolling) {
          this.scheduleNext();
        }
      });
    }, interval);
  }

  private normalizeSnapshot(raw: TelemetrySnapshot | null): TelemetrySnapshot | null {
    if (!raw) return null;
    const snapshot: TelemetrySnapshot = { ...raw };

    // 1. Normalize RAM stats
    const ram = snapshot.system?.ram || snapshot.ram;
    if (ram) {
      if (ram.usage_percent === undefined && ram.total_mb > 0 && ram.used_mb !== undefined) {
        ram.usage_percent = Number(((ram.used_mb / ram.total_mb) * 100).toFixed(1));
      }
    }

    // 2. Normalize Network stats
    const net = snapshot.system?.network || (snapshot as unknown as { network?: Record<string, unknown> }).network;
    if (net) {
      const rawNet = net as unknown as Record<string, unknown>;
      if (net.bytes_recv === undefined && typeof rawNet.received_kb === "number") {
        net.bytes_recv = rawNet.received_kb * 1024;
      }
      if (net.bytes_sent === undefined && typeof rawNet.transmitted_kb === "number") {
        net.bytes_sent = rawNet.transmitted_kb * 1024;
      }
      if (net.speed_mbps === undefined) {
        const rx = typeof rawNet.total_rx_kbps === "number" ? rawNet.total_rx_kbps : 0;
        const tx = typeof rawNet.total_tx_kbps === "number" ? rawNet.total_tx_kbps : 0;
        net.speed_mbps = Number(((rx + tx) / 1000).toFixed(2));
      }
    }

    // 3. Normalize Process telemetry
    const rawProcesses = snapshot.system?.processes || snapshot.processes;
    if (rawProcesses) {
      const allProcesses = Array.isArray(rawProcesses.top_ram)
        ? rawProcesses.top_ram
        : Array.isArray(rawProcesses)
        ? (rawProcesses as unknown as typeof rawProcesses.top_ram)
        : [];

      const total_count =
        typeof rawProcesses.total_count === "number" && rawProcesses.total_count > 0
          ? rawProcesses.total_count
          : allProcesses.length;

      const top_ram =
        Array.isArray(rawProcesses.top_ram) && rawProcesses.top_ram.length > 0
          ? rawProcesses.top_ram
          : [...allProcesses].sort((a, b) => (b.ram_mb || 0) - (a.ram_mb || 0));

      const top_cpu =
        Array.isArray(rawProcesses.top_cpu) && rawProcesses.top_cpu.length > 0
          ? rawProcesses.top_cpu
          : [...allProcesses].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));

      const normalizedProcesses = {
        total_count,
        top_ram,
        top_cpu,
        top_disk: rawProcesses.top_disk || [],
      };

      if (snapshot.system) {
        snapshot.system.processes = normalizedProcesses;
      }
      snapshot.processes = normalizedProcesses;
    }

    // 4. Enrich Disks telemetry from disksCache if missing
    const rawDisks = snapshot.system?.disks || snapshot.disks;
    if (Array.isArray(rawDisks) && rawDisks.length > 0) {
      this.disksCache = rawDisks;
    } else if (this.disksCache.length > 0) {
      if (!snapshot.system) snapshot.system = {};
      snapshot.system.disks = this.disksCache;
      snapshot.disks = this.disksCache;
    }

    // 5. Ensure top-level field mirrors exist
    if (!snapshot.cpu && snapshot.system?.cpu) snapshot.cpu = snapshot.system.cpu;
    if (!snapshot.ram && snapshot.system?.ram) snapshot.ram = snapshot.system.ram;
    if (!snapshot.disks && snapshot.system?.disks) snapshot.disks = snapshot.system.disks;
    if (!snapshot.battery && snapshot.system?.battery) snapshot.battery = snapshot.system.battery;

    return snapshot;
  }

  /**
   * Single poll execution cycle.
   * Strictly prevents overlapping requests.
   */
  private async pollOnce(): Promise<void> {
    if (this.isExecutingPoll) {
      return;
    }

    this.isExecutingPoll = true;
    this.inFlightController = new AbortController();

    if (!this.state.snapshot) {
      this.setState({ loading: true });
    }

    try {
      const now = Date.now();
      // Scan connected storage devices every 30s or on startup
      if (this.disksCache.length === 0 || now - this.lastDisksScan > 30000) {
        this.lastDisksScan = now;
        fetchSystemDisks()
          .then((disks) => {
            if (disks && disks.length > 0) {
              this.disksCache = disks;
              if (this.state.snapshot) {
                const updated = { ...this.state.snapshot };
                if (!updated.system) updated.system = {};
                if (!updated.system.disks || updated.system.disks.length === 0) {
                  updated.system.disks = disks;
                }
                if (!updated.disks || updated.disks.length === 0) {
                  updated.disks = disks;
                }
                this.setState({ snapshot: updated });
              }
            }
          })
          .catch(() => {});
      }

      const rawSnapshot = await fetchStatus({
        signal: this.inFlightController.signal,
        timeoutMs: 4000,
      });

      const snapshot = this.normalizeSnapshot(rawSnapshot);
      this.setState({
        snapshot,
        loading: false,
        error: null,
        connectionState: "CONNECTED",
        lastUpdated: now,
      });
    } catch (err: unknown) {
      // If manually cancelled by abort, ignore state update
      if (this.inFlightController?.signal.aborted) {
        return;
      }

      const now = Date.now();
      let connectionState: ConnectionState = "REQUEST_FAILED";

      if (err instanceof ApiClientError) {
        if (err.code === "AUTHENTICATION_FAILED") {
          connectionState = "AUTHENTICATION_FAILED";
        } else if (err.code === "BACKEND_UNAVAILABLE" || err.code === "TIMEOUT") {
          connectionState = "BACKEND_UNAVAILABLE";
        }
      }

      // Check if data is stale
      if (this.state.lastUpdated && now - this.state.lastUpdated > STALE_THRESHOLD_MS) {
        connectionState = "STALE";
      }

      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
        connectionState,
        lastError: now,
      });
    } finally {
      this.inFlightController = null;
      this.isExecutingPoll = false;
    }
  }
}

// Global coordinator singleton
export const telemetryCoordinator = new TelemetryCoordinator();

/**
 * Standard React hook to subscribe to telemetry state.
 */
export function useTelemetryStore<T = TelemetryState>(
  selector: (state: TelemetryState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(telemetryCoordinator.getState());
  return useSyncExternalStore(telemetryCoordinator.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
