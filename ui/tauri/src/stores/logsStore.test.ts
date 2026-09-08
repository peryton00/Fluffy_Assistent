import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logsCoordinator } from "./logsStore";
import * as operationsApi from "../services/api/operations";

describe("LogsCoordinator Store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logsCoordinator.stop();
    logsCoordinator.clearLogs();
    logsCoordinator.setPaused(false);
  });

  afterEach(() => {
    logsCoordinator.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("initializes with default empty state", () => {
    const state = logsCoordinator.getState();
    expect(state.logs).toEqual([]);
    expect(state.isPolling).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetches logs when started and updates store state", async () => {
    const mockLogs = [
      { message: "Server running", level: "info" as const },
      { message: "Task completed", level: "action" as const },
    ];
    vi.spyOn(operationsApi, "fetchLogs").mockResolvedValue(mockLogs);

    logsCoordinator.start();
    expect(logsCoordinator.getState().isPolling).toBe(true);

    // Fast-forward initial timer (0ms)
    await vi.advanceTimersByTimeAsync(0);

    const state = logsCoordinator.getState();
    expect(state.logs).toEqual(mockLogs);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.lastUpdated).not.toBeNull();
  });

  it("polls every 5000ms", async () => {
    const fetchSpy = vi.spyOn(operationsApi, "fetchLogs").mockResolvedValue([]);

    logsCoordinator.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("pauses and skips log updates when paused", async () => {
    const fetchSpy = vi.spyOn(operationsApi, "fetchLogs").mockResolvedValue([]);

    logsCoordinator.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    logsCoordinator.togglePause();
    expect(logsCoordinator.getState().isPaused).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    // Should not fetch because paused
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    logsCoordinator.togglePause();
    expect(logsCoordinator.getState().isPaused).toBe(false);
  });

  it("clears logs upon clearLogs call", () => {
    logsCoordinator.clearLogs();
    expect(logsCoordinator.getState().logs).toEqual([]);
  });

  it("handles fetch errors gracefully without throwing", async () => {
    vi.spyOn(operationsApi, "fetchLogs").mockRejectedValue(new Error("Network disconnect"));

    logsCoordinator.start();
    await vi.advanceTimersByTimeAsync(0);

    const state = logsCoordinator.getState();
    expect(state.error?.message).toBe("Network disconnect");
    expect(state.loading).toBe(false);
  });
});
