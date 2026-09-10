import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import {
  fetchLocalInterfaces,
  fetchLocalDevices,
  fetchLocalFlows,
  fetchLocalWifiProfiles,
  fetchLocalNetworkSnapshot,
  fetchLocalTrafficSummary,
  fetchLocalTrafficHistory,
} from "./localNetwork";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("Local Network API Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchLocalInterfaces queries /local_network/interfaces with query param", async () => {
    const mockData = {
      ok: true,
      data: {
        count: 1,
        interfaces: [
          {
            id: "1",
            name: "Wi-Fi",
            interface_type: "wifi",
            status: "up",
            is_physical: true,
            is_loopback: false,
            is_up: true,
            ipv4_addresses: ["192.168.1.100/24"],
            ipv6_addresses: [],
          },
        ],
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalInterfaces(true);
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/interfaces?include_rates=true", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Wi-Fi");
  });

  it("fetchLocalDevices queries /local_network/devices", async () => {
    const mockData = {
      ok: true,
      data: {
        count: 1,
        devices: [
          {
            ip_address: "192.168.1.1",
            mac_address: "00:11:22:33:44:55",
            is_gateway: true,
            is_self: false,
            state: "reachable",
          },
        ],
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalDevices();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/devices", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].is_gateway).toBe(true);
  });

  it("fetchLocalFlows queries /local_network/flows", async () => {
    const mockData = {
      ok: true,
      data: {
        count: 1,
        flows: [
          {
            protocol: "tcp",
            local_address: "127.0.0.1",
            local_port: 5123,
            state: "established",
            pid: 1234,
            process_name: "python.exe",
          },
        ],
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalFlows();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/flows", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].process_name).toBe("python.exe");
  });

  it("fetchLocalWifiProfiles queries /local_network/wifi", async () => {
    const mockData = {
      ok: true,
      data: {
        count: 1,
        profiles: [
          {
            ssid: "Test_SSID",
            interface_name: "Wi-Fi",
            connected: true,
            signal_percent: 85,
            security: "WPA2-Personal",
            cipher: "AES",
            auth_type: "WPA2PSK",
            has_profile: true,
          },
        ],
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalWifiProfiles();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/wifi", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].ssid).toBe("Test_SSID");
  });

  it("fetchLocalNetworkSnapshot queries /local_network/snapshot", async () => {
    const mockData = {
      ok: true,
      snapshot: {
        timestamp: 123456789,
        interfaces: [],
        devices: [],
        active_flows: [],
        wifi_profiles: [],
        errors: {},
        success: true,
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalNetworkSnapshot();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/snapshot", undefined);
    expect(result.success).toBe(true);
  });

  it("fetchLocalTrafficSummary queries /local_network/traffic_summary", async () => {
    const mockData = {
      ok: true,
      summary: {
        timestamp: 123456789,
        total_inbound_bytes_delta: 1000,
        total_outbound_bytes_delta: 2000,
        total_rx_bytes_per_sec: 100.0,
        total_tx_bytes_per_sec: 200.0,
        active_flows_count: 5,
        active_processes_count: 2,
        processes: [],
        interfaces: [],
        destinations: [],
        protocols: { TCP: 5 },
        directions: { outbound: 5 },
      },
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalTrafficSummary();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/traffic_summary", undefined);
    expect(result?.active_flows_count).toBe(5);
  });

  it("fetchLocalTrafficHistory queries /local_network/traffic_history with window", async () => {
    const mockData = {
      ok: true,
      window: "1h",
      history: [
        {
          timestamp: 123456700,
          window_seconds: 60,
          inbound_bytes: 500,
          outbound_bytes: 1000,
          rx_bytes_per_sec: 50.0,
          tx_bytes_per_sec: 100.0,
          active_flows_count: 3,
          active_processes_count: 1,
        },
      ],
    };
    (apiClient.get as any).mockResolvedValue(mockData);

    const result = await fetchLocalTrafficHistory("1h");
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/traffic_history?window=1h", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].inbound_bytes).toBe(500);
  });
});

