import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { networkStore } from "./networkStore";
import * as systemsApi from "../services/api/systems";

describe("NetworkStore Manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    networkStore.stopPolling();
  });

  afterEach(() => {
    networkStore.stopPolling();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("polls network status, role, and machines every 5000ms", async () => {
    const roleSpy = vi.spyOn(systemsApi, "getNetworkRole").mockResolvedValue({ ok: true, role: "admin" });
    const machinesSpy = vi.spyOn(systemsApi, "getAdminMachines").mockResolvedValue({
      ok: true,
      machines: [{ machine_id: "node-1", ip: "192.168.1.50", port: 9000, name: "Worker 1", online: true }],
      active_machine: "node-1",
    });
    vi.spyOn(systemsApi, "getAdminMachineData").mockResolvedValue({ ok: true, data: {} });

    networkStore.startPolling();
    await vi.advanceTimersByTimeAsync(0);

    expect(roleSpy).toHaveBeenCalledTimes(1);
    expect(machinesSpy).toHaveBeenCalledTimes(1);
    expect(networkStore.getState().role).toBe("admin");
    expect(networkStore.getState().machines.length).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(roleSpy).toHaveBeenCalledTimes(2);
    expect(machinesSpy).toHaveBeenCalledTimes(2);
  });

  it("changes network role via changeRole", async () => {
    const setRoleSpy = vi.spyOn(systemsApi, "setNetworkRole").mockResolvedValue({ ok: true });
    vi.spyOn(systemsApi, "getNetworkRole").mockResolvedValue({ ok: true, role: "available" });

    await networkStore.changeRole("available");

    expect(setRoleSpy).toHaveBeenCalledWith("available");
    expect(networkStore.getState().role).toBe("available");
  });

  it("switches target machine via switchTarget", async () => {
    const switchSpy = vi.spyOn(systemsApi, "switchAdminMachine").mockResolvedValue({ ok: true });
    vi.spyOn(systemsApi, "getNetworkRole").mockResolvedValue({ ok: true, role: "admin" });
    vi.spyOn(systemsApi, "getAdminMachines").mockResolvedValue({ ok: true, machines: [], active_machine: "node-2" });
    vi.spyOn(systemsApi, "getAdminMachineData").mockResolvedValue({ ok: true, data: {} });

    await networkStore.switchTarget("node-2");

    expect(switchSpy).toHaveBeenCalledWith("node-2");
    expect(networkStore.getState().activeMachineId).toBe("node-2");
  });
});
