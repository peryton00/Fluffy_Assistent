import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchApplications,
  refreshApplications,
  launchApplication,
  uninstallApplication,
  killProcess,
  toggleStartupApp,
  addStartupApp,
  removeStartupApp,
  getNetworkRole,
  setNetworkRole,
  getAdminMachines,
  switchAdminMachine,
  getAdminMachineData,
  sendAdminMachineAction,
  addAdminMachine,
  removeAdminMachine,
} from "./systems";
import { apiClient } from "./client";

describe("Systems API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches applications via GET /apps", async () => {
    const mockApps = [
      { id: "app-1", name: "Visual Studio Code", exe_path: "C:\\VSCode\\code.exe" },
    ];
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue(mockApps);

    const result = await fetchApplications();

    expect(getSpy).toHaveBeenCalledWith("/apps", undefined);
    expect(result).toEqual(mockApps);
  });

  it("refreshes applications via POST /apps/refresh", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, count: 42 });

    const result = await refreshApplications();

    expect(postSpy).toHaveBeenCalledWith("/apps/refresh", undefined, undefined);
    expect(result.count).toBe(42);
  });

  it("launches application via POST /apps/launch", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await launchApplication({ exe_path: "C:\\notepad.exe", name: "Notepad" });

    expect(postSpy).toHaveBeenCalledWith("/apps/launch", { exe_path: "C:\\notepad.exe", name: "Notepad" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("uninstalls application via POST /apps/uninstall", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await uninstallApplication({ uninstall_string: "MsiExec /X{123}", name: "OldApp" });

    expect(postSpy).toHaveBeenCalledWith("/apps/uninstall", { uninstall_string: "MsiExec /X{123}", name: "OldApp" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("kills process via POST /command with KillProcess payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await killProcess(1234);

    expect(postSpy).toHaveBeenCalledWith("/command", { KillProcess: { pid: 1234 } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("toggles startup app via POST /command with StartupToggle payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await toggleStartupApp("Discord", false);

    expect(postSpy).toHaveBeenCalledWith("/command", { StartupToggle: { name: "Discord", enabled: false } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("adds startup app via POST /command with StartupAdd payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await addStartupApp("MyDaemon", "C:\\daemon.exe");

    expect(postSpy).toHaveBeenCalledWith("/command", { StartupAdd: { name: "MyDaemon", path: "C:\\daemon.exe" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("removes startup app via POST /command with StartupRemove payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await removeStartupApp("OldStartup");

    expect(postSpy).toHaveBeenCalledWith("/command", { StartupRemove: { name: "OldStartup" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("gets and sets network roles via /network/role", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, role: "admin" });
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const roleRes = await getNetworkRole();
    expect(getSpy).toHaveBeenCalledWith("/network/role", undefined);
    expect(roleRes.role).toBe("admin");

    await setNetworkRole("available");
    expect(postSpy).toHaveBeenCalledWith("/network/role", { role: "available" }, undefined);
  });

  it("interacts with admin machine endpoints", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ ok: true, machines: [] });
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    await getAdminMachines();
    expect(getSpy).toHaveBeenCalledWith("/network/admin/machines", undefined);

    await switchAdminMachine("node-1");
    expect(postSpy).toHaveBeenCalledWith("/network/admin/switch", { machine_id: "node-1" }, undefined);

    await getAdminMachineData("node-1");
    expect(getSpy).toHaveBeenCalledWith("/network/admin/data/node-1", undefined);

    await sendAdminMachineAction("node-1", "kill_process", { pid: 4000 });
    expect(postSpy).toHaveBeenCalledWith("/network/admin/action", { machine_id: "node-1", action: "kill_process", payload: { pid: 4000 } }, undefined);

    await addAdminMachine("192.168.1.100", 9000, "Node 100");
    expect(postSpy).toHaveBeenCalledWith("/network/admin/add", { ip: "192.168.1.100", port: 9000, name: "Node 100" }, undefined);

    await removeAdminMachine("node-1");
    expect(postSpy).toHaveBeenCalledWith("/network/admin/remove", { machine_id: "node-1" }, undefined);
  });
});
