/**
 * Fluffy Desktop - Network Intelligence Store (N9.4)
 * 
 * Manages state for interpreted Network Intelligence:
 * - Network environment identity & fingerprint
 * - Classified subnet devices with confidence and evidence
 * - Managed local listening services with lifecycle tracking
 * - Bounded chronological timeline of network transitions
 * - Active inspection selection for devices and services
 * 
 * Strict Architecture:
 * - Independent store distinct from cluster networking (networkStore.ts) and raw observation (localNetworkStore.ts).
 * - Single coordinated polling loop avoiding duplicate requests.
 * - Read-only visualization; zero secret leakage; resilient error and stale-state handling.
 */

import { useSyncExternalStore } from "react";
import {
  fetchNetworkIntelligenceSummary,
  fetchNetworkIntelligenceDevices,
  fetchNetworkIntelligenceServices,
  fetchNetworkIntelligenceChanges,
} from "../services/api/networkIntelligence";
import type {
  NetworkIntelligenceSummary,
  ClassifiedNetworkDevice,
  ManagedLocalService,
  NetworkChangeEvent,
} from "../types/contracts";

export interface NetworkIntelligenceState {
  summary: NetworkIntelligenceSummary | null;
  devices: ClassifiedNetworkDevice[];
  services: ManagedLocalService[];
  changes: NetworkChangeEvent[];
  loading: boolean;
  isPolling: boolean;
  error: Error | null;
  lastPolled: number | null;
  selectedDeviceId: string | null;
  selectedServiceId: string | null;
}

const NETWORK_INTELLIGENCE_POLL_INTERVAL_MS = 5000;

class NetworkIntelligenceStoreManager {
  private state: NetworkIntelligenceState = {
    summary: null,
    devices: [],
    services: [],
    changes: [],
    loading: false,
    isPolling: false,
    error: null,
    lastPolled: null,
    selectedDeviceId: null,
    selectedServiceId: null,
  };

  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isExecutingPoll = false;

  public getState = (): NetworkIntelligenceState => {
    return this.state;
  };

  private setState(partial: Partial<NetworkIntelligenceState>): void {
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

  public selectDevice = (deviceId: string | null): void => {
    this.setState({ selectedDeviceId: deviceId, selectedServiceId: null });
  };

  public selectService = (serviceId: string | null): void => {
    this.setState({ selectedServiceId: serviceId, selectedDeviceId: null });
  };

  public startPolling = (): void => {
    if (this.state.isPolling) {
      return;
    }
    this.setState({ isPolling: true });
    this.scheduleNext(0);
  };

  public stopPolling = (): void => {
    if (!this.state.isPolling) {
      return;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.setState({ isPolling: false });
  };

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

  public refreshSummary = async (): Promise<void> => {
    try {
      const summary = await fetchNetworkIntelligenceSummary();
      this.setState({ summary, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshDevices = async (): Promise<void> => {
    try {
      const devices = await fetchNetworkIntelligenceDevices();
      this.setState({ devices, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshServices = async (): Promise<void> => {
    try {
      const services = await fetchNetworkIntelligenceServices();
      this.setState({ services, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshChanges = async (limit = 100): Promise<void> => {
    try {
      const changes = await fetchNetworkIntelligenceChanges(limit);
      this.setState({ changes, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  private scheduleNext(delayMs = NETWORK_INTELLIGENCE_POLL_INTERVAL_MS): void {
    if (!this.state.isPolling) {
      return;
    }
    this.timerId = setTimeout(() => {
      this.pollOnce().finally(() => {
        if (this.state.isPolling) {
          this.scheduleNext();
        }
      });
    }, delayMs);
  }

  private async pollOnce(): Promise<void> {
    if (this.isExecutingPoll) {
      return;
    }
    this.isExecutingPoll = true;
    this.setState({ loading: true });

    try {
      const [summary, devices, services, changes] = await Promise.all([
        fetchNetworkIntelligenceSummary().catch(() => null),
        fetchNetworkIntelligenceDevices().catch(() => []),
        fetchNetworkIntelligenceServices().catch(() => []),
        fetchNetworkIntelligenceChanges(100).catch(() => []),
      ]);

      this.setState({
        summary: summary || this.state.summary,
        devices: devices.length > 0 || !this.state.devices.length ? devices : this.state.devices,
        services: services.length > 0 || !this.state.services.length ? services : this.state.services,
        changes: changes.length > 0 || !this.state.changes.length ? changes : this.state.changes,
        error: null,
        lastPolled: Date.now(),
        loading: false,
      });
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
        loading: false,
        lastPolled: Date.now(),
      });
    } finally {
      this.isExecutingPoll = false;
    }
  }
}

export const networkIntelligenceStoreManager = new NetworkIntelligenceStoreManager();

export function useNetworkIntelligenceStore(): NetworkIntelligenceState {
  return useSyncExternalStore(
    networkIntelligenceStoreManager.subscribe,
    networkIntelligenceStoreManager.getState,
    networkIntelligenceStoreManager.getState
  );
}
