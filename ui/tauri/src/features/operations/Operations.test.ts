import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationsOverview } from "./views/OperationsOverview";
import { QuickActionsView } from "./views/QuickActionsView";
import { ActiveTelemetryView } from "./views/ActiveTelemetryView";
import { LiveLogsView } from "./views/LiveLogsView";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { SubsystemsStatusCard } from "./components/SubsystemsStatusCard";
import { GuardianSummaryCard } from "./components/GuardianSummaryCard";
import { PendingConfirmationsBanner } from "./components/PendingConfirmationsBanner";

import { telemetryCoordinator } from "../../stores/telemetryStore";
import { logsCoordinator } from "../../stores/logsStore";
import { uiStore } from "../../stores/uiStore";
import * as operationsApi from "../../services/api/operations";
import * as statusApi from "../../services/api/status";
import type { TelemetrySnapshot } from "../../types/contracts";

const mockSnapshot: TelemetrySnapshot = {
  status: "active",
  schema_version: "2.0.0",
  timestamp: Date.now(),
  system: {
    cpu: {
      usage_percent: 42.5,
      cores_usage: [40, 45, 50, 35],
      temperature: 55,
      frequency_mhz: 3200,
    },
    ram: {
      total_mb: 16384,
      used_mb: 8192,
      free_mb: 8192,
      usage_percent: 50.0,
    },
    disks: [
      {
        name: "OSDisk",
        mount_point: "C:",
        total_bytes: 512000000000,
        available_bytes: 256000000000,
        used_percent: 50.0,
      },
    ],
    network: {
      interface_name: "Ethernet0",
      bytes_sent: 1048576,
      bytes_recv: 2097152,
      packets_sent: 1000,
      packets_recv: 2000,
    },
    battery: {
      percent: 85,
      is_charging: true,
      time_remaining_minutes: 180,
    },
  },
  pending_confirmations: [
    {
      command_id: "cmd-test-1",
      command_name: "Kill Rogue Process",
      message: "Process rogue.exe needs termination",
      details: { pid: 4012 },
    },
  ],
  security_alerts: [
    {
      id: "alert-1",
      timestamp: Date.now(),
      severity: "high",
      alert_type: "UNUSUAL_SOCKET",
      message: "Unusual outbound socket connection",
    },
  ],
  active_sessions: 1,
};

describe("Operations Workspace Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(statusApi, "fetchStatus").mockResolvedValue(mockSnapshot);
    vi.spyOn(operationsApi, "fetchLogs").mockResolvedValue([
      { message: "Fluffy initialized", level: "info" as const },
      { message: "Process terminated", level: "action" as const },
    ]);
  });

  afterEach(() => {
    telemetryCoordinator.stop();
    logsCoordinator.stop();
    vi.restoreAllMocks();
  });

  it("renders OperationsOverview with all primary metrics, subsystems, and pending approvals", async () => {
    await telemetryCoordinator.refreshNow();
    await logsCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(OperationsOverview));

    // Header title
    expect(html).toContain("Operations Command Center");

    // Primary metrics
    expect(html).toContain("CPU Usage");
    expect(html).toContain("43%");
    expect(html).toContain("Memory (RAM)");
    expect(html).toContain("8.0 / 16.0 GB");
    expect(html).toContain("Storage / Disk");
    expect(html).toContain("50%");
    expect(html).toContain("Network Adapter");
    expect(html).toContain("Ethernet0");
    expect(html).toContain("Battery / Power");
    expect(html).toContain("85%");

    // Subsystems
    expect(html).toContain("Fluffy Subsystems");
    expect(html).toContain("CORE");
    expect(html).toContain("BRAIN");
    expect(html).toContain("GUARDIAN");
    expect(html).toContain("MEMORY");

    // Pending Confirmations banner
    expect(html).toContain("Action Requires Approval");
    expect(html).toContain("Kill Rogue Process");
  });

  it("renders SubsystemsStatusCard correctly with live snapshot", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubsystemsStatusCard, {
        snapshot: mockSnapshot,
        connectionState: "CONNECTED",
      })
    );

    expect(html).toContain("CORE");
    expect(html).toContain("Operational");
    expect(html).toContain("BRAIN");
    expect(html).toContain("GUARDIAN");
    expect(html).toContain("Monitoring");
    expect(html).toContain("MEMORY");
    expect(html).toContain("Ready");
  });

  it("renders GuardianSummaryCard with threat and pending count badges", () => {
    const html = renderToStaticMarkup(
      React.createElement(GuardianSummaryCard, {
        snapshot: mockSnapshot,
      })
    );

    expect(html).toContain("Guardian Security");
    expect(html).toContain("Threat Alerts");
    expect(html).toContain("Pending Actions");
    expect(html).toContain("Review Guardian Workspace");
  });

  it("renders PendingConfirmationsBanner with command details", () => {
    const html = renderToStaticMarkup(
      React.createElement(PendingConfirmationsBanner, {
        confirmations: mockSnapshot.pending_confirmations!,
      })
    );

    expect(html).toContain("Kill Rogue Process");
    expect(html).toContain("cmd-test-1");
    expect(html).toContain("Authorize");
    expect(html).toContain("Reject");
  });

  it("renders QuickActionsView with Normalize and Speed Test triggers", () => {
    const html = renderToStaticMarkup(React.createElement(QuickActionsView));

    expect(html).toContain("Operations — Quick Actions");
    expect(html).toContain("Normalize Host System");
    expect(html).toContain("POST /normalize");
    expect(html).toContain("Network Speed &amp; Latency Benchmark");
    expect(html).toContain("POST /net-speed");
  });

  it("renders ActiveTelemetryView with core distribution and filesystem mounts", async () => {
    await telemetryCoordinator.refreshNow();
    const html = renderToStaticMarkup(React.createElement(ActiveTelemetryView));

    expect(html).toContain("Operations — Active Telemetry");
    expect(html).toContain("Core Distribution");
    expect(html).toContain("Filesystem Mounts (1)");
    expect(html).toContain("Memory Allocation &amp; Buffers");
  });

  it("renders LiveLogsView with stream controls and log entries", async () => {
    await logsCoordinator.refreshNow();
    const html = renderToStaticMarkup(React.createElement(LiveLogsView));

    expect(html).toContain("Operations — Live Logs");
    expect(html).toContain("Filter logs by keyword...");
    expect(html).toContain("Fluffy initialized");
    expect(html).toContain("Process terminated");
  });

  it("switches views dynamically in OperationsWorkspace router", () => {
    uiStore.setActiveSidebarView("quick_actions");
    let html = renderToStaticMarkup(React.createElement(OperationsWorkspace));
    expect(html).toContain("Operations — Quick Actions");

    uiStore.setActiveSidebarView("telemetry");
    html = renderToStaticMarkup(React.createElement(OperationsWorkspace));
    expect(html).toContain("Operations — Active Telemetry");

    uiStore.setActiveSidebarView("logs");
    html = renderToStaticMarkup(React.createElement(OperationsWorkspace));
    expect(html).toContain("Operations — Live Logs");

    uiStore.setActiveSidebarView("overview");
    html = renderToStaticMarkup(React.createElement(OperationsWorkspace));
    expect(html).toContain("Operations Command Center");
  });

  it("sets selectedItem in uiStore and opens Inspector", () => {
    expect(uiStore.getState().selectedItem).toBeNull();
    uiStore.setSelectedItem({
      type: "cpu",
      id: "cpu-test",
      title: "CPU Telemetry",
      data: { usage_percent: 42 },
    }, true);

    const state = uiStore.getState();
    expect(state.selectedItem).not.toBeNull();
    expect(state.selectedItem?.type).toBe("cpu");
    expect(state.selectedItem?.title).toBe("CPU Telemetry");
    expect(state.inspectorOpen).toBe(true);

    uiStore.setSelectedItem(null);
    expect(uiStore.getState().selectedItem).toBeNull();
  });
});
