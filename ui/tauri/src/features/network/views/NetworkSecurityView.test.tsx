import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { NetworkSecurityView } from "./NetworkSecurityView";
import type { NetworkEvent, NetworkStateSnapshot } from "../../../types/contracts";

const blankSnapshot: NetworkStateSnapshot = {
  revision: 1,
  captured_at_epoch_ms: Date.now(),
  nodes: [],
  devices: [],
  connections: [],
  interfaces: [],
  traffic: {
    rx_bytes: 0,
    tx_bytes: 0,
    rx_packets: 0,
    tx_packets: 0,
    rx_errors: 0,
    tx_errors: 0,
    rx_drops: 0,
    tx_drops: 0,
    top_talkers: [],
  },
};

describe("NetworkSecurityView Component (Phase N12)", () => {
  beforeEach(() => {
    networkWorkspaceStore.applySnapshot(blankSnapshot);
  });

  it("renders empty state when no security events exist", () => {
    const html = renderToStaticMarkup(<NetworkSecurityView />);
    expect(html).toContain("Network Security Observations");
    expect(html).toContain("Total Observations");
    expect(html).toContain("No anomalous or security-relevant network observations matching current filter.");
  });

  it("renders security observations with severity pills, kind, and evidence", () => {
    const mockSecurityEvent: NetworkEvent = {
      event_id: "evt-sec-1",
      sequence: 1,
      state_revision: 1,
      timestamp_epoch_ms: 1700000000000,
      category: "security",
      event_type: "securityobservationcreated",
      severity: "error",
      target_device_id: "dev-mac-00:11:22:33:44:55",
      summary: "Gateway MAC address transition detected",
      details: {
        observation_id: "net_gw_change_eth0_1700000000",
        anomaly_kind: "gateway_identity_changed",
        risk_level: "high",
        affected_interface: "eth0",
        affected_mac: "AA:BB:CC:DD:EE:FF",
        evidence: ["Previous MAC: 00:11:22:33:44:55", "New MAC: AA:BB:CC:DD:EE:FF"],
      },
    };

    const mockNoticeEvent: NetworkEvent = {
      event_id: "evt-sec-2",
      sequence: 2,
      state_revision: 2,
      timestamp_epoch_ms: 1700000005000,
      category: "security",
      event_type: "securityobservationcreated",
      severity: "notice",
      target_node_id: "node-alpha",
      summary: "First-time observation of process listening on port 8080",
      details: {
        observation_id: "net_listen_tcp_8080_1700000005",
        anomaly_kind: "unexpected_listening_socket",
        risk_level: "low",
        affected_pid: 1234,
        evidence: ["Port 8080 first seen for node-alpha"],
      },
    };

    // Load initial snapshot and apply events
    const snapshot: NetworkStateSnapshot = {
      revision: 1,
      captured_at_epoch_ms: Date.now(),
      nodes: [],
      devices: [],
      connections: [],
      interfaces: [],
      traffic: {
        rx_bytes: 0,
        tx_bytes: 0,
        rx_packets: 0,
        tx_packets: 0,
        rx_errors: 0,
        tx_errors: 0,
        rx_drops: 0,
        tx_drops: 0,
        top_talkers: [],
      },
    };
    networkWorkspaceStore.applySnapshot(snapshot);
    networkWorkspaceStore.applyEvent(mockSecurityEvent);
    networkWorkspaceStore.applyEvent(mockNoticeEvent);

    const html = renderToStaticMarkup(<NetworkSecurityView />);
    expect(html).toContain("Total Observations");
    expect(html).toContain("Critical / Error");
    expect(html).toContain("Notice / Info");
    expect(html).toContain("gateway_identity_changed");
    expect(html).toContain("unexpected_listening_socket");
    expect(html).toContain("dev-mac-00:11:22:33:44:55");
    expect(html).toContain("node-alpha");
    expect(html).toContain("Gateway MAC address transition detected");
    expect(html).toContain("ERROR");
    expect(html).toContain("NOTICE");
  });

  it("displays stale sync indicator when workspace is stale", () => {
    networkWorkspaceStore.markStale();
    const html = renderToStaticMarkup(<NetworkSecurityView />);
    expect(html).toContain("STALE SYNC");
  });
});
