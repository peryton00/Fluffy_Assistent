import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLogs,
  normalizeSystem,
  runSpeedTest,
  confirmPendingAction,
  cancelPendingAction,
} from "./operations";
import { apiClient } from "./client";

describe("Operations API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET /logs via apiClient.get", async () => {
    const mockLogs = [
      { message: "System initialized", level: "info" as const },
      { message: "Process terminated", level: "action" as const },
    ];
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue(mockLogs);

    const result = await fetchLogs();

    expect(getSpy).toHaveBeenCalledWith("/logs", undefined);
    expect(result).toEqual(mockLogs);
  });

  it("calls POST /normalize via apiClient.post", async () => {
    const mockNormalizeResult = {
      ok: true,
      cleanup: "Temp files cleanup triggered",
      settings: "Volume (50%), Brightness (70%) reset",
      unusual_processes: [],
    };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(mockNormalizeResult);

    const result = await normalizeSystem();

    expect(postSpy).toHaveBeenCalledWith("/normalize", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("calls POST /net-speed via apiClient.post", async () => {
    const mockSpeedResult = {
      status: "success",
      download_mbps: 125.4,
      ping_ms: 18.2,
    };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(mockSpeedResult);

    const result = await runSpeedTest();

    expect(postSpy).toHaveBeenCalledWith("/net-speed", undefined, undefined);
    expect(result.download_mbps).toBe(125.4);
    expect(result.ping_ms).toBe(18.2);
  });

  it("sends Confirm payload to POST /command for confirmation", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await confirmPendingAction("cmd-12345");

    expect(postSpy).toHaveBeenCalledWith("/command", {
      Confirm: {
        command_id: "cmd-12345",
      },
    }, undefined);
    expect(result.ok).toBe(true);
  });

  it("sends Cancel payload to POST /command for cancellation", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await cancelPendingAction("cmd-67890");

    expect(postSpy).toHaveBeenCalledWith("/command", {
      Cancel: {
        command_id: "cmd-67890",
      },
    }, undefined);
    expect(result.ok).toBe(true);
  });
});
