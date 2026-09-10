import { describe, it, expect, vi, beforeEach } from "vitest";
import { networkIntelligenceStoreManager } from "./networkIntelligenceStore";
import * as netIntelApi from "../services/api/networkIntelligence";

vi.mock("../services/api/networkIntelligence", () => ({
  fetchNetworkIntelligenceSummary: vi.fn(),
  fetchNetworkIntelligenceDevices: vi.fn(),
  fetchNetworkIntelligenceServices: vi.fn(),
  fetchNetworkIntelligenceChanges: vi.fn(),
}));

describe("NetworkIntelligenceStoreManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    networkIntelligenceStoreManager.stopPolling();
    networkIntelligenceStoreManager.selectDevice(null);
    networkIntelligenceStoreManager.selectService(null);
  });

  it("provides initial state with empty collections", () => {
    const state = networkIntelligenceStoreManager.getState();
    expect(state.summary).toBeNull();
    expect(state.devices).toEqual([]);
    expect(state.services).toEqual([]);
    expect(state.changes).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.isPolling).toBe(false);
    expect(state.selectedDeviceId).toBeNull();
    expect(state.selectedServiceId).toBeNull();
  });

  it("selection management updates active inspection entity", () => {
    networkIntelligenceStoreManager.selectDevice("dev_123");
    expect(networkIntelligenceStoreManager.getState().selectedDeviceId).toBe("dev_123");
    expect(networkIntelligenceStoreManager.getState().selectedServiceId).toBeNull();

    networkIntelligenceStoreManager.selectService("svc_456");
    expect(networkIntelligenceStoreManager.getState().selectedServiceId).toBe("svc_456");
    expect(networkIntelligenceStoreManager.getState().selectedDeviceId).toBeNull();
  });

  it("refreshNow updates all intelligence domains atomically", async () => {
    const mockSummary = {
      network_identity: {
        network_id: "net_abc",
        interface: "Ethernet",
        network_type: "ethernet",
        local_addresses: ["192.168.1.10"],
        confidence: 0.85,
        evidence: ["gateway_mac"],
        trust_level: "TRUSTED",
      },
      device_count: { total: 2, online: 2 },
      service_count: { total: 1, active: 1 },
      active_processes_count: 1,
      recent_events: [],
      insights: [],
      freshness: { collected_at: 1000, age_seconds: 0.5, is_stale: false },
    };

    const mockDevices = [
      {
        device_id: "dev_1",
        ip_addresses: ["192.168.1.1"],
        classification: "GATEWAY",
        confidence: 0.95,
        evidence: ["gateway"],
        status: "active",
        is_gateway: true,
      },
    ];

    const mockServices = [
      {
        service_id: "svc_1",
        process_name: "httpd",
        port: 80,
        protocol: "tcp",
        status: "ACTIVE",
        lifetime_seconds: 120,
        missed_snapshots: 0,
        consecutive_observations: 5,
        first_seen: 1000,
        last_seen: 1120,
      },
    ];

    const mockChanges = [
      {
        event_type: "DEVICE_APPEARED",
        timestamp: 1100,
      },
    ];

    (netIntelApi.fetchNetworkIntelligenceSummary as any).mockResolvedValue(mockSummary);
    (netIntelApi.fetchNetworkIntelligenceDevices as any).mockResolvedValue(mockDevices);
    (netIntelApi.fetchNetworkIntelligenceServices as any).mockResolvedValue(mockServices);
    (netIntelApi.fetchNetworkIntelligenceChanges as any).mockResolvedValue(mockChanges);

    let notifyCount = 0;
    const unsubscribe = networkIntelligenceStoreManager.subscribe(() => {
      notifyCount++;
    });

    await networkIntelligenceStoreManager.refreshNow();

    const state = networkIntelligenceStoreManager.getState();
    expect(state.summary).toEqual(mockSummary);
    expect(state.devices).toHaveLength(1);
    expect(state.services).toHaveLength(1);
    expect(state.changes).toHaveLength(1);
    expect(state.error).toBeNull();
    expect(state.lastPolled).not.toBeNull();
    expect(notifyCount).toBeGreaterThan(0);

    unsubscribe();
  });
});
