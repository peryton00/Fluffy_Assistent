import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { guardianStore } from "./guardianStore";
import * as guardianApi from "../services/api/guardian";
import { telemetryCoordinator } from "./telemetryStore";

describe("Guardian Store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads trusted processes", async () => {
    const fetchSpy = vi.spyOn(guardianApi, "fetchTrustedProcesses").mockResolvedValue(["proc1.exe", "proc2.exe"]);

    await guardianStore.loadTrustedProcesses(true);

    expect(fetchSpy).toHaveBeenCalled();
    expect(guardianStore.getState().trustedProcesses).toEqual(["proc1.exe", "proc2.exe"]);
  });

  it("authorizes a pending command and refreshes telemetry", async () => {
    const confirmSpy = vi.spyOn(guardianApi, "confirmApproval").mockResolvedValue({ ok: true });
    const refreshSpy = vi.spyOn(telemetryCoordinator, "refreshNow").mockResolvedValue();

    await guardianStore.authorize("cmd-999");

    expect(confirmSpy).toHaveBeenCalledWith("cmd-999");
    expect(refreshSpy).toHaveBeenCalled();
    expect(guardianStore.getState().inFlightApprovals["cmd-999"]).toBeUndefined();
  });

  it("rejects a pending command and refreshes telemetry", async () => {
    const cancelSpy = vi.spyOn(guardianApi, "cancelApproval").mockResolvedValue({ ok: true });
    const refreshSpy = vi.spyOn(telemetryCoordinator, "refreshNow").mockResolvedValue();

    await guardianStore.reject("cmd-888");

    expect(cancelSpy).toHaveBeenCalledWith("cmd-888");
    expect(refreshSpy).toHaveBeenCalled();
    expect(guardianStore.getState().inFlightApprovals["cmd-888"]).toBeUndefined();
  });

  it("adds and removes trusted processes", async () => {
    vi.spyOn(guardianApi, "addTrustedProcess").mockResolvedValue({ ok: true });
    vi.spyOn(guardianApi, "removeTrustedProcess").mockResolvedValue({ ok: true });
    vi.spyOn(guardianApi, "fetchTrustedProcesses")
      .mockResolvedValueOnce(["newproc.exe"])
      .mockResolvedValueOnce([]);

    await guardianStore.addTrusted("newproc.exe");
    expect(guardianStore.getState().trustedProcesses).toContain("newproc.exe");

    await guardianStore.removeTrusted("newproc.exe");
    expect(guardianStore.getState().trustedProcesses).not.toContain("newproc.exe");
  });

  it("resets guardian baseline recognition", async () => {
    const clearSpy = vi.spyOn(guardianApi, "clearGuardianRecognition").mockResolvedValue({ ok: true });
    const refreshSpy = vi.spyOn(telemetryCoordinator, "refreshNow").mockResolvedValue();

    await guardianStore.resetRecognition();

    expect(clearSpy).toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalled();
  });
});
