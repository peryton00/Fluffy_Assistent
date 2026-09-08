import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { telemetryCoordinator } from "./telemetryStore";
import * as statusService from "../services/api/status";
import { ApiClientError } from "../services/api/client";
import type { TelemetrySnapshot } from "../types/contracts";

describe("TelemetryCoordinator", () => {
  const mockSnapshot: TelemetrySnapshot = {
    timestamp: "2026-09-08T12:00:00Z",
    cpu: { usage_percent: 15.2, cores_usage: [12, 18] },
    ram: { total_mb: 16384, used_mb: 8192, free_mb: 8192, usage_percent: 50 },
    disks: [{ name: "C:", mount_point: "C:\\", total_bytes: 512000, available_bytes: 256000, used_percent: 50 }],
    networks: [{ interface_name: "Ethernet", bytes_sent: 100, bytes_recv: 200, packets_sent: 10, packets_recv: 20 }],
    processes: { total_count: 142, top_cpu: [], top_ram: [] },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    telemetryCoordinator.stop();
    telemetryCoordinator.setActivityState("ACTIVE");
  });

  afterEach(() => {
    telemetryCoordinator.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("maintains a single coordinator lifecycle and updates state on successful poll", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.start();
    expect(telemetryCoordinator.getState().isPolling).toBe(true);

    // Advance to trigger immediate first poll (delay 0)
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const state = telemetryCoordinator.getState();
    expect(state.connectionState).toBe("CONNECTED");
    expect(state.snapshot?.cpu?.usage_percent).toBe(15.2);
    expect(state.loading).toBe(false);
    expect(state.lastUpdated).not.toBeNull();
  });

  it("polls on ~2000ms cadence in ACTIVE state", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.setActivityState("ACTIVE");
    telemetryCoordinator.start();

    // Initial poll
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Advance another 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("adapts to ~10000ms cadence in IDLE state", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.setActivityState("IDLE");
    telemetryCoordinator.start();

    // Initial poll
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance 2000ms - should NOT poll again yet
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance remaining 8000ms (total 10,000ms)
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate polling loops when start() is called repeatedly", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.start();
    telemetryCoordinator.start();
    telemetryCoordinator.start();

    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2010);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("handles backend errors and sets appropriate diagnostic connectionState", async () => {
    vi.spyOn(statusService, "fetchStatus").mockRejectedValue(
      new ApiClientError("Backend down", "BACKEND_UNAVAILABLE", "/status")
    );

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    const state = telemetryCoordinator.getState();
    expect(state.connectionState).toBe("BACKEND_UNAVAILABLE");
    expect(state.error?.message).toContain("Backend down");
    expect(state.lastError).not.toBeNull();
  });

  it("supports manual refreshNow() trigger", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await telemetryCoordinator.refreshNow();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("stops safely when stop() is called repeatedly", () => {
    telemetryCoordinator.start();
    telemetryCoordinator.stop();
    expect(() => {
      telemetryCoordinator.stop();
      telemetryCoordinator.stop();
    }).not.toThrow();
    expect(telemetryCoordinator.getState().isPolling).toBe(false);
  });

  it("handles start() -> stop() -> start() lifecycle cleanly without orphaned loops", async () => {
    const fetchSpy = vi.spyOn(statusService, "fetchStatus").mockResolvedValue(mockSnapshot);

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    telemetryCoordinator.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2010);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("detects stale state when updates fail for >15 seconds and recovers on next success", async () => {
    let shouldFail = false;
    vi.spyOn(statusService, "fetchStatus").mockImplementation(async () => {
      if (shouldFail) {
        throw new ApiClientError("Backend down", "BACKEND_UNAVAILABLE", "/status");
      }
      return mockSnapshot;
    });

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(telemetryCoordinator.getState().connectionState).toBe("CONNECTED");

    // Start failing
    shouldFail = true;

    // Advance 6 seconds - error occurs, lastUpdated is 6s old (not >15s yet)
    await vi.advanceTimersByTimeAsync(6000);
    expect(telemetryCoordinator.getState().connectionState).toBe("BACKEND_UNAVAILABLE");

    // Advance to 18 seconds total - now >15s since last successful update
    await vi.advanceTimersByTimeAsync(12000);
    expect(telemetryCoordinator.getState().connectionState).toBe("STALE");

    // Recover backend
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(2010);
    expect(telemetryCoordinator.getState().connectionState).toBe("CONNECTED");
  });

  it("prevents overlapping /status requests while a request is in flight", async () => {
    let resolveFirstRequest: (val: TelemetrySnapshot) => void = () => {};
    const firstPromise = new Promise<TelemetrySnapshot>((res) => {
      resolveFirstRequest = res;
    });

    let callCount = 0;
    vi.spyOn(statusService, "fetchStatus").mockImplementation(() => {
      callCount++;
      if (callCount === 1) return firstPromise;
      return Promise.resolve(mockSnapshot);
    });

    telemetryCoordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(callCount).toBe(1);

    // Trigger manual refresh while request 1 is still pending
    telemetryCoordinator.refreshNow();
    // Second request should not fire concurrently due to execution lock
    expect(callCount).toBe(1);

    // Resolve first request
    resolveFirstRequest(mockSnapshot);
    await vi.advanceTimersByTimeAsync(10);

    // Now coordinator is free for subsequent polls
    await vi.advanceTimersByTimeAsync(2010);
    expect(callCount).toBe(2);
  });
});
