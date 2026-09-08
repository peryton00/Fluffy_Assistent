import { describe, it, expect, beforeEach } from "vitest";
import { analyticsStore } from "./analyticsStore";
import type { TelemetrySnapshot } from "../types/contracts";

describe("AnalyticsStore", () => {
  beforeEach(() => {
    analyticsStore.clearHistory();
  });

  it("processes snapshot and creates timeline points", () => {
    const mockSnapshot: TelemetrySnapshot = {
      timestamp: 1000,
      cpu: { usage_percent: 45.5, cores_usage: [40, 51] },
      ram: { total_mb: 16000, used_mb: 8000, free_mb: 8000, usage_percent: 50.0 },
      system: {
        network: { interface_name: "eth0", bytes_sent: 1000, bytes_recv: 2000, packets_sent: 10, packets_recv: 20, speed_mbps: 1.2 },
      },
      processes: {
        total_count: 140,
        top_cpu: [{ pid: 101, name: "fluffy_brain.exe", cpu_percent: 12.0, ram_mb: 150, status: "running" }],
        top_ram: [{ pid: 102, name: "chrome.exe", cpu_percent: 2.0, ram_mb: 800, status: "running" }],
      },
    };

    analyticsStore.processSnapshot(mockSnapshot);
    const state = analyticsStore.getState();

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].cpuPercent).toBe(45.5);
    expect(state.timeline[0].ramPercent).toBe(50.0);
    expect(state.summary.cpu.current).toBe(45.5);
    expect(state.summary.ram.current).toBe(50.0);
    expect(state.topCpuProcesses).toHaveLength(1);
    expect(state.topRamProcesses).toHaveLength(1);
  });

  it("records network surge when speed exceeds threshold", () => {
    const highSpeedSnapshot: TelemetrySnapshot = {
      timestamp: 2000,
      cpu: { usage_percent: 20, cores_usage: [] },
      ram: { total_mb: 16000, used_mb: 4000, free_mb: 12000, usage_percent: 25 },
      system: {
        network: { interface_name: "eth0", bytes_sent: 5000000, bytes_recv: 10000000, packets_sent: 100, packets_recv: 200, speed_mbps: 5.5 },
      },
    };

    analyticsStore.processSnapshot(highSpeedSnapshot);
    const state = analyticsStore.getState();

    expect(state.spikes.length).toBeGreaterThanOrEqual(1);
    expect(state.spikes[0].speedMbps).toBe(5.5);
  });

  it("bounds timeline history to max limit", () => {
    for (let i = 0; i < 70; i++) {
      analyticsStore.processSnapshot({
        timestamp: 10000 + i * 1000,
        cpu: { usage_percent: 10 + (i % 30), cores_usage: [] },
        ram: { total_mb: 16000, used_mb: 8000, free_mb: 8000, usage_percent: 50 },
      });
    }

    const state = analyticsStore.getState();
    expect(state.timeline.length).toBeLessThanOrEqual(60);
  });

  it("sets selectedPoint", () => {
    const point = {
      id: "p-1",
      timestamp: 123456,
      timeStr: "12:00:00",
      cpuPercent: 30,
      ramPercent: 40,
      ramUsedMb: 4000,
      ramTotalMb: 10000,
      netSentBytes: 0,
      netRecvBytes: 0,
      netSpeedMbps: 0,
      diskPercent: 20,
      batteryPercent: null,
    };
    analyticsStore.setSelectedPoint(point);
    expect(analyticsStore.getState().selectedPoint).toEqual(point);
  });
});
