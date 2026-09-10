import { describe, it, expect, vi, beforeEach } from "vitest";
import { localNetworkStoreManager } from "./localNetworkStore";
import * as localNetworkApi from "../services/api/localNetwork";

vi.mock("../services/api/localNetwork", () => ({
  fetchLocalInterfaces: vi.fn(),
  fetchLocalDevices: vi.fn(),
  fetchLocalFlows: vi.fn(),
  fetchLocalWifiProfiles: vi.fn(),
  fetchLocalNetworkSnapshot: vi.fn(),
  fetchLocalTrafficSummary: vi.fn(),
  fetchLocalTrafficHistory: vi.fn(),
}));

describe("LocalNetworkStoreManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localNetworkStoreManager.stopPolling();
  });

  it("provides initial state with empty lists", () => {
    const state = localNetworkStoreManager.getState();
    expect(state.interfaces).toEqual([]);
    expect(state.devices).toEqual([]);
    expect(state.flows).toEqual([]);
    expect(state.wifiProfiles).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.isPolling).toBe(false);
  });

  it("refreshNow fetches full snapshot and updates store state", async () => {
    const mockSnapshot = {
      timestamp: 123456789,
      interfaces: [
        {
          id: "1",
          name: "Wi-Fi",
          interface_type: "wifi",
          status: "up",
          is_physical: true,
          is_loopback: false,
          is_up: true,
          ipv4_addresses: ["192.168.1.50/24"],
          ipv6_addresses: [],
        },
      ],
      devices: [
        {
          ip_address: "192.168.1.1",
          mac_address: "AA:BB:CC:DD:EE:FF",
          is_gateway: true,
          is_self: false,
          state: "reachable",
        },
      ],
      active_flows: [
        {
          protocol: "tcp",
          local_address: "127.0.0.1",
          local_port: 9002,
          state: "listen",
          pid: 5678,
          process_name: "fluffy-core.exe",
        },
      ],
      wifi_profiles: [
        {
          ssid: "Office_5G",
          interface_name: "Wi-Fi",
          connected: true,
          signal_percent: 92,
          security: "WPA2-Personal",
          cipher: "AES",
          auth_type: "WPA2PSK",
          has_profile: true,
        },
      ],
      errors: {},
      success: true,
    };

    (localNetworkApi.fetchLocalNetworkSnapshot as any).mockResolvedValue(mockSnapshot);

    let notifyCount = 0;
    const unsubscribe = localNetworkStoreManager.subscribe(() => {
      notifyCount++;
    });

    await localNetworkStoreManager.refreshNow();

    const updatedState = localNetworkStoreManager.getState();
    expect(updatedState.interfaces).toHaveLength(1);
    expect(updatedState.devices).toHaveLength(1);
    expect(updatedState.flows).toHaveLength(1);
    expect(updatedState.wifiProfiles).toHaveLength(1);
    expect(updatedState.error).toBeNull();
    expect(updatedState.lastPolled).not.toBeNull();
    expect(notifyCount).toBeGreaterThan(0);

    unsubscribe();
  });

  it("handles fetch errors gracefully without crashing", async () => {
    (localNetworkApi.fetchLocalNetworkSnapshot as any).mockRejectedValue(new Error("Network timeout"));

    await localNetworkStoreManager.refreshNow();

    const state = localNetworkStoreManager.getState();
    expect(state.error?.message).toBe("Network timeout");
    expect(state.loading).toBe(false);
  });
});
