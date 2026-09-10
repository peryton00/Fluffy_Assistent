import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalNetworkView } from "./LocalNetworkView";

vi.mock("../../../stores/localNetworkStore", () => {
  const mockState = {
    interfaces: [
      {
        id: "1",
        name: "Wi-Fi",
        description: "Intel Wi-Fi 6 AX200",
        mac_address: "00:1A:2B:3C:4D:5E",
        interface_type: "wifi",
        status: "up",
        is_physical: true,
        is_loopback: false,
        is_up: true,
        ipv4_addresses: ["192.168.1.100/24"],
        ipv6_addresses: [],
        total_received_bytes: 1048576,
        total_transmitted_bytes: 524288,
        rates: {
          rx_bytes_per_sec: 10240,
          tx_bytes_per_sec: 5120,
          rx_bits_per_sec: 81920,
          tx_bits_per_sec: 40960,
        },
      },
      {
        id: "2",
        name: "Ethernet",
        description: "Realtek PCIe GbE Family Controller",
        mac_address: "AA:BB:CC:DD:EE:01",
        interface_type: "ethernet",
        status: "down",
        is_physical: true,
        is_loopback: false,
        is_up: false,
        ipv4_addresses: [],
        ipv6_addresses: [],
        total_received_bytes: 0,
        total_transmitted_bytes: 0,
        rates: null,
      },
    ],
    devices: [
      {
        ip_address: "192.168.1.1",
        mac_address: "AA:BB:CC:DD:EE:FF",
        hostname: "gateway.home",
        interface_name: "Wi-Fi",
        is_gateway: true,
        is_self: false,
        state: "reachable",
      },
      {
        ip_address: "192.168.1.100",
        mac_address: "00:1A:2B:3C:4D:5E",
        hostname: "fluffy-workstation",
        interface_name: "Wi-Fi",
        is_gateway: false,
        is_self: true,
        state: "permanent",
      },
    ],
    flows: [
      {
        protocol: "tcp",
        local_address: "127.0.0.1",
        local_port: 9002,
        remote_address: null,
        remote_port: null,
        state: "listen",
        pid: 1234,
        process_name: "fluffy-core.exe",
      },
      {
        protocol: "tcp",
        local_address: "192.168.1.100",
        local_port: 54321,
        remote_address: "1.1.1.1",
        remote_port: 443,
        state: "established",
        pid: 5678,
        process_name: "chrome.exe",
      },
      {
        protocol: "udp",
        local_address: "0.0.0.0",
        local_port: 5353,
        remote_address: null,
        remote_port: null,
        state: "unknown",
        pid: 9999,
        process_name: "mDNSResponder.exe",
      },
    ],
    wifiProfiles: [
      {
        ssid: "Lab_Network_5G",
        interface_name: "Wi-Fi",
        connected: true,
        signal_percent: 88,
        security: "WPA2-Personal",
        cipher: "AES",
        auth_type: "WPA2PSK",
        has_profile: true,
      },
      {
        ssid: "Guest_Wireless",
        interface_name: "Wi-Fi",
        connected: false,
        signal_percent: null,
        security: "Open",
        cipher: "None",
        auth_type: "open",
        has_profile: true,
      },
    ],
    snapshot: null,
    loading: false,
    isPolling: true,
    error: null,
    lastPolled: 1672531199000,
  };

  return {
    useLocalNetworkStore: vi.fn(() => mockState),
    localNetworkStoreManager: {
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      refreshNow: vi.fn(),
      getState: vi.fn(() => mockState),
      subscribe: vi.fn(() => () => {}),
    },
  };
});

describe("LocalNetworkView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header and summary stat tiles correctly", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);

    expect(html).toContain("Local Host Network Observability");
    expect(html).toContain("LIVE POLLING (5s)");
    expect(html).toContain("Network Interfaces");
    expect(html).toContain("/ 2 Total");
    expect(html).toContain("Discovered LAN Devices");
    expect(html).toContain("Active Sockets / Flows");
    expect(html).toContain("Lab_Network_5G (88%)");
  });

  it("renders interface cards and traffic rates in overview", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);

    expect(html).toContain("Host Network Interfaces &amp; Bandwidth Counters");
    expect(html).toContain("Intel Wi-Fi 6 AX200");
    expect(html).toContain("192.168.1.100/24");
    expect(html).toContain("00:1A:2B:3C:4D:5E");
  });

  it("renders discovered LAN devices with gateway and localhost badges", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);

    expect(html).toContain("192.168.1.1");
    expect(html).toContain("gateway.home");
    expect(html).toContain("GATEWAY");
    expect(html).toContain("LOCALHOST");
  });

  it("renders active socket flows correctly", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);

    expect(html).toContain("fluffy-core.exe");
    expect(html).toContain("chrome.exe");
    expect(html).toContain("127.0.0.1:9002");
    expect(html).toContain("1.1.1.1:443");
  });

  it("renders Wi-Fi profiles without exposing secret credentials", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);

    expect(html).toContain("Lab_Network_5G");
    expect(html).toContain("CONNECTED");
    expect(html).toContain("WPA2-Personal");
    expect(html).toContain("Guest_Wireless");

    // Strict security assertion: No secret labels exist in rendered HTML
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/passphrase/i);
    expect(html).not.toMatch(/psk/i);
  });

  it("renders packet monitor tab button", () => {
    const html = renderToStaticMarkup(<LocalNetworkView />);
    expect(html).toContain("Packet Monitor (N8)");
  });
});

