/**
 * Fluffy Desktop - Local Network Observability Store
 * 
 * Manages host machine local network observation state:
 * - Network interfaces with bandwidth counters/rates
 * - Local subnet devices (passive ARP discovery)
 * - Active socket-to-process flow mappings
 * - Saved Wi-Fi profiles & non-secret security posture
 * 
 * Strict Architecture:
 * - Additive store, independent from cluster networking (networkStore.ts).
 * - Read-only observation, zero secret leakage, safe error propagation.
 */

import { useSyncExternalStore } from "react";
import {
  fetchLocalInterfaces,
  fetchLocalDevices,
  fetchLocalFlows,
  fetchLocalWifiProfiles,
  fetchLocalNetworkSnapshot,
  fetchLocalTrafficSummary,
  fetchLocalTrafficHistory,
  startPacketCapture as apiStartPacketCapture,
  stopPacketCapture as apiStopPacketCapture,
  getPacketCaptureStatus as apiGetPacketCaptureStatus,
} from "../services/api/localNetwork";
import type {
  LocalNetworkInterface,
  LocalNetworkDevice,
  LocalNetworkFlow,
  LocalWifiProfile,
  LocalNetworkSnapshot,
  AggregatedTrafficSummary,
  TrafficTimeBucket,
  PacketCaptureStatus,
} from "../types/contracts";

export interface LocalNetworkState {
  interfaces: LocalNetworkInterface[];
  devices: LocalNetworkDevice[];
  flows: LocalNetworkFlow[];
  wifiProfiles: LocalWifiProfile[];
  snapshot: LocalNetworkSnapshot | null;
  trafficSummary: AggregatedTrafficSummary | null;
  trafficHistory: TrafficTimeBucket[];
  packetCaptureStatus: PacketCaptureStatus | null;
  loading: boolean;
  isPolling: boolean;
  error: Error | null;
  lastPolled: number | null;
}

const LOCAL_NETWORK_POLL_INTERVAL_MS = 5000;

class LocalNetworkStoreManager {
  private state: LocalNetworkState = {
    interfaces: [],
    devices: [],
    flows: [],
    wifiProfiles: [],
    snapshot: null,
    trafficSummary: null,
    trafficHistory: [],
    packetCaptureStatus: null,
    loading: false,
    isPolling: false,
    error: null,
    lastPolled: null,
  };


  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isExecutingPoll = false;

  public getState = (): LocalNetworkState => {
    return this.state;
  };

  private setState(partial: Partial<LocalNetworkState>): void {
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

  public refreshInterfaces = async (): Promise<void> => {
    try {
      const interfaces = await fetchLocalInterfaces();
      this.setState({ interfaces, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshDevices = async (): Promise<void> => {
    try {
      const devices = await fetchLocalDevices();
      this.setState({ devices, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshFlows = async (): Promise<void> => {
    try {
      const flows = await fetchLocalFlows();
      this.setState({ flows, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshWifiProfiles = async (): Promise<void> => {
    try {
      const wifiProfiles = await fetchLocalWifiProfiles();
      this.setState({ wifiProfiles, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshTrafficSummary = async (): Promise<void> => {
    try {
      const trafficSummary = await fetchLocalTrafficSummary();
      this.setState({ trafficSummary, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshTrafficHistory = async (window: "1h" | "24h" = "1h"): Promise<void> => {
    try {
      const trafficHistory = await fetchLocalTrafficHistory(window);
      this.setState({ trafficHistory, error: null });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public startPacketCapture = async (params?: { interface_name?: string; duration_seconds?: number; max_packets?: number }): Promise<void> => {
    try {
      const status = await apiStartPacketCapture(params);
      if (status) {
        this.setState({ packetCaptureStatus: status, error: null });
      }
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public stopPacketCapture = async (): Promise<void> => {
    try {
      const status = await apiStopPacketCapture();
      if (status) {
        this.setState({ packetCaptureStatus: status, error: null });
      }
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };

  public refreshPacketCaptureStatus = async (): Promise<void> => {
    try {
      const status = await apiGetPacketCaptureStatus();
      if (status) {
        this.setState({ packetCaptureStatus: status, error: null });
      }
    } catch (err) {
      this.setState({ error: err instanceof Error ? err : new Error(String(err)) });
    }
  };


  private scheduleNext(delayMs = LOCAL_NETWORK_POLL_INTERVAL_MS): void {
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
      const snapshot = await fetchLocalNetworkSnapshot();
      let trafficSummary: AggregatedTrafficSummary | null = null;
      try {
        if (typeof fetchLocalTrafficSummary === "function") {
          trafficSummary = await fetchLocalTrafficSummary();
        }
      } catch {
        trafficSummary = null;
      }

      this.setState({
        snapshot,
        trafficSummary,
        interfaces: snapshot.interfaces ?? [],
        devices: snapshot.devices ?? [],
        flows: snapshot.active_flows ?? [],
        wifiProfiles: snapshot.wifi_profiles ?? [],
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

export const localNetworkStoreManager = new LocalNetworkStoreManager();

export function useLocalNetworkStore(): LocalNetworkState {
  return useSyncExternalStore(
    localNetworkStoreManager.subscribe,
    localNetworkStoreManager.getState,
    localNetworkStoreManager.getState
  );
}
