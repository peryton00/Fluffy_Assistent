import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkIntelligenceView } from "./NetworkIntelligenceView";

vi.mock("../../../stores/networkIntelligenceStore", () => {
  const mockState = {
    summary: {
      network_identity: {
        network_id: "net_workstation_lab",
        interface: "Wi-Fi",
        network_type: "wifi",
        ssid: "Fluffy_Lab_5G",
        gateway: "192.168.1.1",
        local_addresses: ["192.168.1.100"],
        confidence: 0.92,
        evidence: ["gateway_mac_oui", "active_ssid"],
        trust_level: "TRUSTED",
      },
      device_count: {
        total: 5,
        online: 4,
      },
      service_count: {
        total: 3,
        active: 2,
      },
      active_processes_count: 8,
      recent_events: [
        {
          event_type: "NETWORK_SWITCHED",
          timestamp: 1726000000,
        },
      ],
      insights: [
        {
          insight_type: "DEVICE_SURGE",
          summary: "3 new mobile devices joined local subnet",
          confidence: 0.88,
        },
      ],
      freshness: {
        collected_at: 1726000050,
        age_seconds: 1.2,
        is_stale: false,
      },
    },
    devices: [
      {
        device_id: "dev_gateway",
        ip_addresses: ["192.168.1.1"],
        mac_address: "AA:BB:CC:11:22:33",
        hostname: "router.asus.com",
        vendor: "ASUSTek Computer Inc.",
        classification: "GATEWAY",
        confidence: 0.95,
        evidence: ["Gateway route ownership", "OUI vendor match"],
        status: "active",
        user_alias: "Core Gateway",
        is_gateway: true,
      },
      {
        device_id: "dev_phone",
        ip_addresses: ["192.168.1.55"],
        mac_address: "3C:22:FB:99:88:77",
        hostname: "sudip-iphone",
        vendor: "Apple, Inc.",
        classification: "PHONE",
        confidence: 0.85,
        evidence: ["Hostname identifier 'iphone'", "Apple OUI"],
        status: "active",
        user_alias: "Sudip's iPhone",
        is_gateway: false,
      },
    ],
    services: [
      {
        service_id: "svc_ssh",
        process_name: "sshd.exe",
        pid: 2048,
        local_address: "0.0.0.0",
        port: 22,
        protocol: "tcp",
        status: "ACTIVE",
        lifetime_seconds: 7200,
        well_known_name: "OpenSSH Server",
        missed_snapshots: 0,
        consecutive_observations: 24,
        first_seen: 1725990000,
        last_seen: 1726000000,
      },
    ],
    changes: [
      {
        event_type: "NETWORK_SWITCHED",
        timestamp: 1726000000,
        details: { from: "Guest_WiFi", to: "Fluffy_Lab_5G" },
      },
      {
        event_type: "DEVICE_APPEARED",
        timestamp: 1726000010,
        details: { ip: "192.168.1.55", classification: "PHONE" },
      },
    ],
    loading: false,
    isPolling: true,
    error: null,
    lastPolled: 1726000050000,
    selectedDeviceId: "dev_gateway",
    selectedServiceId: null,
  };

  return {
    useNetworkIntelligenceStore: vi.fn(() => mockState),
    networkIntelligenceStoreManager: {
      getState: vi.fn(() => mockState),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      refreshNow: vi.fn(),
      selectDevice: vi.fn(),
      selectService: vi.fn(),
      refreshChanges: vi.fn(),
    },
  };
});

vi.mock("../../../stores/uiStore", () => ({
  useUiStore: Object.assign(
    vi.fn((selector) => selector({ activeDomain: "systems", activeSidebarView: "network_intelligence" })),
    {
      getState: vi.fn(() => ({
        setActiveDomain: vi.fn(),
        setActiveSidebarView: vi.fn(),
      })),
    }
  ),
}));

describe("NetworkIntelligenceView Component (Phase N9.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders workspace container and top header", () => {
    const html = renderToStaticMarkup(<NetworkIntelligenceView />);
    expect(html).toContain("Network Intelligence (N9)");
    expect(html).toContain("LIVE POLLING (5s)");
    expect(html).toContain("data-testid=\"network-intelligence-view\"");
  });

  it("renders network environment fingerprint card with confidence and trust", () => {
    const html = renderToStaticMarkup(<NetworkIntelligenceView />);
    expect(html).toContain("net_workstation_lab");
    expect(html).toContain("Fluffy_Lab_5G");
    expect(html).toContain("192.168.1.1");
    expect(html).toContain("TRUSTED");
    expect(html).toContain("92%");
    expect(html).toContain("gateway_mac_oui");
  });

  it("renders metrics summary cards", () => {
    const html = renderToStaticMarkup(<NetworkIntelligenceView />);
    expect(html).toContain("Subnet Devices");
    expect(html).toContain("Local Service Catalog");
    expect(html).toContain("Owning Processes");
    expect(html).toContain("DEVICE_SURGE");
  });

  it("renders Inspector drawer when entity is selected", () => {
    const html = renderToStaticMarkup(<NetworkIntelligenceView />);
    expect(html).toContain("data-testid=\"network-intelligence-inspector\"");
    expect(html).toContain("Device Inspector");
    expect(html).toContain("Core Gateway");
    expect(html).toContain("ASUSTek Computer Inc.");
    expect(html).toContain("GATEWAY");
  });

  it("never leaks passwords, credentials, raw packet payloads, or threat verdicts", () => {
    const html = renderToStaticMarkup(<NetworkIntelligenceView />);
    const forbidden = [
      "password",
      "wifi_password",
      "psk",
      "wpa_key",
      "raw_payload",
      "packet_bytes",
      "pcap",
      "threat_verdict",
      "attack_type",
      "is_malicious",
    ];

    for (const term of forbidden) {
      expect(html.toLowerCase()).not.toContain(term);
    }
  });
});
