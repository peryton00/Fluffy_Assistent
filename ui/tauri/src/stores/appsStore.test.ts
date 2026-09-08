import { describe, it, expect, vi, beforeEach } from "vitest";
import { appsStore } from "./appsStore";
import * as systemsApi from "../services/api/systems";

describe("AppsStore Manager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads applications into store and caches results", async () => {
    const mockApps = [
      { id: "app-1", name: "VS Code", exe_path: "C:\\code.exe" },
      { id: "app-2", name: "Google Chrome", exe_path: "C:\\chrome.exe" },
    ];
    const fetchSpy = vi.spyOn(systemsApi, "fetchApplications").mockResolvedValue(mockApps);

    await appsStore.loadApps(true);

    const state = appsStore.getState();
    expect(state.apps).toEqual(mockApps);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Call again without force - should reuse cache
    await appsStore.loadApps(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("updates search query in store", () => {
    appsStore.setSearchQuery("chrome");
    expect(appsStore.getState().searchQuery).toBe("chrome");
  });

  it("triggers launch and uninstall API methods", async () => {
    const launchSpy = vi.spyOn(systemsApi, "launchApplication").mockResolvedValue({ ok: true });
    const uninstallSpy = vi.spyOn(systemsApi, "uninstallApplication").mockResolvedValue({ ok: true });

    const app = { id: "app-1", name: "App1", exe_path: "C:\\app1.exe", uninstall_string: "MsiExec" };
    await appsStore.launch(app);
    expect(launchSpy).toHaveBeenCalledWith({ exe_path: "C:\\app1.exe", location: undefined, name: "App1" });

    await appsStore.uninstall(app);
    expect(uninstallSpy).toHaveBeenCalledWith({ uninstall_string: "MsiExec", name: "App1" });
  });

  it("handles fetch errors gracefully", async () => {
    vi.spyOn(systemsApi, "fetchApplications").mockRejectedValue(new Error("Disk error"));

    await appsStore.loadApps(true);

    const state = appsStore.getState();
    expect(state.error?.message).toBe("Disk error");
    expect(state.loading).toBe(false);
  });
});
