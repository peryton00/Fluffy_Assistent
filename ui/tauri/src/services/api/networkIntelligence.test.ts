import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import {
  fetchNetworkIntelligenceSummary,
  fetchNetworkIntelligenceDevices,
  fetchNetworkIntelligenceServices,
  fetchNetworkIntelligenceChanges,
} from "./networkIntelligence";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe("Network Intelligence API Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchNetworkIntelligenceSummary queries /local_network/intelligence/summary", async () => {
    const mockSummary = {
      network_identity: {
        network_id: "net_home123",
        interface: "Wi-Fi",
        network_type: "wifi",
        ssid: "Home_WiFi",
        gateway: "192.168.1.1",
        local_addresses: ["192.168.1.50"],
        confidence: 0.9,
        evidence: ["gateway_mac", "ssid"],
        trust_level: "TRUSTED",
      },
      device_count: { total: 4, online: 3 },
      service_count: { total: 2, active: 2 },
      active_processes_count: 5,
      recent_events: [],
      insights: [
        { insight_type: "DEVICE_SURGE", summary: "New devices observed", confidence: 0.8 },
      ],
      freshness: { collected_at: 1000, age_seconds: 1.0, is_stale: false },
    };

    (apiClient.get as any).mockResolvedValue({ ok: true, summary: mockSummary });

    const result = await fetchNetworkIntelligenceSummary();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/intelligence/summary", undefined);
    expect(result).not.toBeNull();
    expect(result?.network_identity.network_id).toBe("net_home123");
    expect(result?.insights).toHaveLength(1);
  });

  it("fetchNetworkIntelligenceDevices queries /local_network/intelligence/devices", async () => {
    const mockDevices = [
      {
        device_id: "dev_1",
        ip_addresses: ["192.168.1.1"],
        mac_address: "AA:BB:CC:00:11:22",
        hostname: "router.local",
        vendor: "Netgear",
        classification: "GATEWAY",
        confidence: 0.95,
        evidence: ["gateway_ip"],
        status: "active",
        user_alias: "Main Gateway",
        is_gateway: true,
      },
    ];

    (apiClient.get as any).mockResolvedValue({ ok: true, devices: mockDevices });

    const result = await fetchNetworkIntelligenceDevices();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/intelligence/devices", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("GATEWAY");
    expect(result[0].user_alias).toBe("Main Gateway");
  });

  it("fetchNetworkIntelligenceServices queries /local_network/intelligence/services", async () => {
    const mockServices = [
      {
        service_id: "svc_1",
        process_name: "ssh",
        pid: 1234,
        local_address: "0.0.0.0",
        port: 22,
        protocol: "tcp",
        status: "ACTIVE",
        lifetime_seconds: 3600,
        well_known_name: "SSH",
        missed_snapshots: 0,
        consecutive_observations: 10,
        first_seen: 1000,
        last_seen: 2000,
      },
    ];

    (apiClient.get as any).mockResolvedValue({ ok: true, services: mockServices });

    const result = await fetchNetworkIntelligenceServices();
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/intelligence/services", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].port).toBe(22);
    expect(result[0].well_known_name).toBe("SSH");
  });

  it("fetchNetworkIntelligenceChanges queries /local_network/intelligence/changes with limit", async () => {
    const mockChanges = [
      {
        event_type: "NETWORK_SWITCHED",
        timestamp: 123456,
        details: { from: "Office", to: "Home" },
      },
    ];

    (apiClient.get as any).mockResolvedValue({ ok: true, changes: mockChanges });

    const result = await fetchNetworkIntelligenceChanges(20);
    expect(apiClient.get).toHaveBeenCalledWith("/local_network/intelligence/changes?limit=20", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe("NETWORK_SWITCHED");
  });
});
