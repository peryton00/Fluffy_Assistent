/**
 * Fluffy Desktop - Analytics Store
 * 
 * Derived operational analytics coordinator.
 * Consumes the single-source telemetry stream from telemetryCoordinator.
 * Zero duplicate polling. Uses a bounded in-memory sliding window (max 60 points).
 */

import { useSyncExternalStore } from "react";
import { telemetryCoordinator } from "./telemetryStore";
import type { ProcessTelemetry, TelemetrySnapshot } from "../types/contracts";

export interface ResourceTimelinePoint {
  id: string;
  timestamp: number;
  timeStr: string;
  cpuPercent: number;
  ramPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  netSentBytes: number;
  netRecvBytes: number;
  netSpeedMbps: number;
  diskPercent: number;
  batteryPercent: number | null;
}

export interface NetworkSpikeEvent {
  id: string;
  timestamp: number;
  timeStr: string;
  type: "upload" | "download" | "surge";
  speedMbps: number;
  deltaMbps: number;
  description: string;
}

export interface AnalyticsSummary {
  cpu: { min: number; max: number; avg: number; current: number };
  ram: { min: number; max: number; avg: number; current: number };
  network: { maxSpeedMbps: number; totalSentMb: number; totalRecvMb: number };
  processCount: number;
}

export interface AnalyticsState {
  timeline: ResourceTimelinePoint[];
  spikes: NetworkSpikeEvent[];
  topCpuProcesses: ProcessTelemetry[];
  topRamProcesses: ProcessTelemetry[];
  selectedPoint: ResourceTimelinePoint | null;
  summary: AnalyticsSummary;
  timeRange: "1m" | "5m" | "15m";
}

const MAX_HISTORY_POINTS = 60;
const SPIKE_THRESHOLD_MBPS = 2.0;

class AnalyticsStoreManager {
  private state: AnalyticsState = {
    timeline: [],
    spikes: [],
    topCpuProcesses: [],
    topRamProcesses: [],
    selectedPoint: null,
    summary: {
      cpu: { min: 0, max: 0, avg: 0, current: 0 },
      ram: { min: 0, max: 0, avg: 0, current: 0 },
      network: { maxSpeedMbps: 0, totalSentMb: 0, totalRecvMb: 0 },
      processCount: 0,
    },
    timeRange: "5m",
  };

  private listeners = new Set<() => void>();
  private unsubscribeTelemetry: (() => void) | null = null;
  private lastSnapshotTimestamp: number | string | null = null;
  private prevNetSent: number | null = null;
  private prevNetRecv: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Subscribe to the single authoritative telemetry coordinator
    this.unsubscribeTelemetry = telemetryCoordinator.subscribe(this.handleTelemetryUpdate);
    // In case snapshot already exists
    const initialSnapshot = telemetryCoordinator.getState().snapshot;
    if (initialSnapshot) {
      this.processSnapshot(initialSnapshot);
    }
  }

  public destroy(): void {
    if (this.unsubscribeTelemetry) {
      this.unsubscribeTelemetry();
      this.unsubscribeTelemetry = null;
    }
  }

  public getState(): AnalyticsState {
    return this.state;
  }

  private setState(partial: Partial<AnalyticsState>): void {
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

  public setSelectedPoint = (point: ResourceTimelinePoint | null): void => {
    this.setState({ selectedPoint: point });
  };

  public setTimeRange = (timeRange: "1m" | "5m" | "15m"): void => {
    this.setState({ timeRange });
  };

  public clearHistory = (): void => {
    this.lastSnapshotTimestamp = null;
    this.prevNetSent = null;
    this.prevNetRecv = null;
    this.setState({
      timeline: [],
      spikes: [],
      topCpuProcesses: [],
      topRamProcesses: [],
      selectedPoint: null,
      summary: {
        cpu: { min: 0, max: 0, avg: 0, current: 0 },
        ram: { min: 0, max: 0, avg: 0, current: 0 },
        network: { maxSpeedMbps: 0, totalSentMb: 0, totalRecvMb: 0 },
        processCount: 0,
      },
    });
  };

  private handleTelemetryUpdate = (): void => {
    const { snapshot } = telemetryCoordinator.getState();
    if (!snapshot) return;
    this.processSnapshot(snapshot);
  };

  public processSnapshot = (snapshot: TelemetrySnapshot): void => {
    const rawTimestamp = snapshot.timestamp;
    if (rawTimestamp && rawTimestamp === this.lastSnapshotTimestamp) {
      return;
    }
    this.lastSnapshotTimestamp = rawTimestamp || Date.now();

    const timestamp = Date.now();
    const dateObj = new Date(timestamp);
    const timeStr = `${String(dateObj.getHours()).padStart(2, "0")}:${String(
      dateObj.getMinutes()
    ).padStart(2, "0")}:${String(dateObj.getSeconds()).padStart(2, "0")}`;

    // 1. Extract CPU
    const cpuPercent =
      snapshot.cpu?.usage_percent ??
      snapshot.system?.cpu?.usage_percent ??
      0;

    // 2. Extract RAM
    const ramUsedMb =
      snapshot.ram?.used_mb ??
      snapshot.system?.ram?.used_mb ??
      0;
    const ramTotalMb =
      snapshot.ram?.total_mb ??
      snapshot.system?.ram?.total_mb ??
      1;
    const ramPercent =
      snapshot.ram?.usage_percent ??
      snapshot.system?.ram?.usage_percent ??
      (ramTotalMb > 0 ? (ramUsedMb / ramTotalMb) * 100 : 0);

    // 3. Extract Network
    const netObj = snapshot.system?.network || (snapshot.networks && snapshot.networks[0]);
    const netSent = netObj?.bytes_sent ?? 0;
    const netRecv = netObj?.bytes_recv ?? 0;
    const netSpeed = netObj?.speed_mbps ?? 0;

    // Compute Delta Speed if available
    let currentSpeedMbps = netSpeed;
    if (this.prevNetSent !== null && this.prevNetRecv !== null) {
      const deltaBytes = (netSent - this.prevNetSent) + (netRecv - this.prevNetRecv);
      if (deltaBytes > 0) {
        // Approximate Mbps over ~2s interval
        const calculatedMbps = (deltaBytes * 8) / (2 * 1000 * 1000);
        if (currentSpeedMbps === 0) {
          currentSpeedMbps = parseFloat(calculatedMbps.toFixed(2));
        }
      }
    }
    this.prevNetSent = netSent;
    this.prevNetRecv = netRecv;

    // 4. Extract Disk
    const diskObj = (snapshot.disks && snapshot.disks[0]) || (snapshot.system?.disks && snapshot.system.disks[0]);
    const diskPercent = diskObj?.used_percent ?? 0;

    // 5. Extract Battery
    const batObj = snapshot.battery || snapshot.system?.battery;
    const batteryPercent = batObj ? batObj.percent : null;

    // 6. Build Timeline Point
    const point: ResourceTimelinePoint = {
      id: `point-${timestamp}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      timeStr,
      cpuPercent: parseFloat(cpuPercent.toFixed(1)),
      ramPercent: parseFloat(ramPercent.toFixed(1)),
      ramUsedMb: Math.round(ramUsedMb),
      ramTotalMb: Math.round(ramTotalMb),
      netSentBytes: netSent,
      netRecvBytes: netRecv,
      netSpeedMbps: currentSpeedMbps,
      diskPercent: parseFloat(diskPercent.toFixed(1)),
      batteryPercent,
    };

    // Keep bounded sliding window
    const newTimeline = [...this.state.timeline, point].slice(-MAX_HISTORY_POINTS);

    // 7. Check for Network Spikes
    let newSpikes = [...this.state.spikes];
    if (currentSpeedMbps >= SPIKE_THRESHOLD_MBPS) {
      const spikeId = `spike-${timestamp}`;
      const lastSpike = newSpikes[newSpikes.length - 1];
      // Avoid duplicate consecutive recordings
      if (!lastSpike || timestamp - lastSpike.timestamp > 4000) {
        newSpikes.push({
          id: spikeId,
          timestamp,
          timeStr,
          type: "surge",
          speedMbps: currentSpeedMbps,
          deltaMbps: currentSpeedMbps,
          description: `Network activity surge detected: ${currentSpeedMbps} Mbps on active interface`,
        });
        newSpikes = newSpikes.slice(-20); // Keep last 20 spikes
      }
    }

    // 8. Extract Processes
    const procObj = snapshot.processes || snapshot.system?.processes;
    const processList = Array.isArray(procObj?.top_ram)
      ? procObj.top_ram
      : Array.isArray(procObj)
      ? (procObj as unknown as ProcessTelemetry[])
      : [];
    const topCpu =
      Array.isArray(procObj?.top_cpu) && procObj.top_cpu.length > 0
        ? procObj.top_cpu
        : [...processList].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
    const topRam =
      Array.isArray(procObj?.top_ram) && procObj.top_ram.length > 0
        ? procObj.top_ram
        : [...processList].sort((a, b) => (b.ram_mb || 0) - (a.ram_mb || 0));
    const processCount = procObj?.total_count ?? processList.length;

    // 9. Compute Summary
    const cpuValues = newTimeline.map((p) => p.cpuPercent);
    const ramValues = newTimeline.map((p) => p.ramPercent);
    const netSpeeds = newTimeline.map((p) => p.netSpeedMbps);

    const minCpu = cpuValues.length ? Math.min(...cpuValues) : 0;
    const maxCpu = cpuValues.length ? Math.max(...cpuValues) : 0;
    const avgCpu = cpuValues.length
      ? parseFloat((cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(1))
      : 0;

    const minRam = ramValues.length ? Math.min(...ramValues) : 0;
    const maxRam = ramValues.length ? Math.max(...ramValues) : 0;
    const avgRam = ramValues.length
      ? parseFloat((ramValues.reduce((a, b) => a + b, 0) / ramValues.length).toFixed(1))
      : 0;

    const maxSpeedMbps = netSpeeds.length ? Math.max(...netSpeeds) : 0;
    const totalSentMb = parseFloat((netSent / (1024 * 1024)).toFixed(2));
    const totalRecvMb = parseFloat((netRecv / (1024 * 1024)).toFixed(2));

    this.setState({
      timeline: newTimeline,
      spikes: newSpikes,
      topCpuProcesses: topCpu,
      topRamProcesses: topRam,
      summary: {
        cpu: { min: minCpu, max: maxCpu, avg: avgCpu, current: point.cpuPercent },
        ram: { min: minRam, max: maxRam, avg: avgRam, current: point.ramPercent },
        network: { maxSpeedMbps, totalSentMb, totalRecvMb },
        processCount,
      },
    });
  };
}

export const analyticsStore = new AnalyticsStoreManager();

/**
 * React hook for consuming derived Analytics state.
 */
export function useAnalyticsStore<T = AnalyticsState>(
  selector: (state: AnalyticsState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(analyticsStore.getState());
  return useSyncExternalStore(
    analyticsStore.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot
  );
}
