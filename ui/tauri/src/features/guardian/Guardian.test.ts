import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuardianOverview } from "./views/GuardianOverview";
import { GuardianAlertsView } from "./views/GuardianAlertsView";
import { PendingApprovalsView } from "./views/PendingApprovalsView";
import { TrustedProcessesView } from "./views/TrustedProcessesView";
import { GuardianHistoryView } from "./views/GuardianHistoryView";
import { GuardianWorkspace } from "./GuardianWorkspace";
import { GuardianStatusCard } from "./components/GuardianStatusCard";
import { ThreatSummaryCard } from "./components/ThreatSummaryCard";
import { ApprovalQueueCard } from "./components/ApprovalQueueCard";
import { TrustedProcessRow } from "./components/TrustedProcessRow";
import { GuardianEventRow } from "./components/GuardianEventRow";
import { GuardianHeader } from "./components/GuardianHeader";

import { telemetryCoordinator } from "../../stores/telemetryStore";
import { guardianStore } from "../../stores/guardianStore";
import { uiStore } from "../../stores/uiStore";
import * as guardianApi from "../../services/api/guardian";
import * as statusApi from "../../services/api/status";
import * as operationsApi from "../../services/api/operations";
import type { TelemetrySnapshot, SecurityAlert, PendingConfirmation, LogEntry } from "../../types/contracts";

const mockAlerts: SecurityAlert[] = [
  {
    id: "alert-1",
    timestamp: "2026-09-08 23:40:00",
    severity: "critical",
    alert_type: "anomaly",
    process_name: "malware.exe",
    pid: 6666,
    reason: "Suspicious memory injection attempt",
    message: "Critical behavioral deviation",
  },
  {
    id: "alert-2",
    timestamp: "2026-09-08 23:41:00",
    severity: "medium",
    alert_type: "startup_anomaly",
    process_name: "script.bat",
    pid: 7777,
    reason: "Unregistered startup script execution",
    message: "Potential persistence modification",
  },
];

const mockApprovals: PendingConfirmation[] = [
  {
    command_id: "cmd-exec-01",
    command_name: "Kill Process Tree",
    id: "appr-1",
    action: "Kill Process Tree",
    requester: "Guardian AI",
    target: "PID 6666 (malware.exe)",
    risk: "high",
    reason: "Prevent privilege escalation",
    timestamp: Date.now(),
  },
];

const mockSnapshot: TelemetrySnapshot = {
  status: "active",
  schema_version: "2.0.0",
  timestamp: Date.now(),
  security_alerts: mockAlerts,
  pending_confirmations: mockApprovals,
  _guardian_verdicts: {
    "6666": {
      process_name: "malware.exe",
      anomaly_score: 0.95,
      verdict: "critical_anomaly",
      is_anomaly: true,
    },
    "1001": {
      process_name: "chrome.exe",
      anomaly_score: 0.05,
      verdict: "normal",
      is_anomaly: false,
    },
  },
  system: {
    cpu: { usage_percent: 25, cores_usage: [25, 25] },
    ram: { total_mb: 16384, used_mb: 8192, free_mb: 8192, usage_percent: 50 },
    disks: [],
    network: { interface_name: "eth0", bytes_sent: 0, bytes_recv: 0, packets_sent: 0, packets_recv: 0, speed_mbps: 1000 },
    battery: { percent: 100, is_charging: true, time_remaining_minutes: 0 },
    processes: { total_count: 50, top_cpu: [], top_ram: [], top_disk: [] },
    persistence: [],
  },
};

const mockLogs: LogEntry[] = [
  {
    timestamp: "2026-09-08 23:45:00",
    level: "WARNING",
    module: "guardian",
    message: "Anomalous process tree detected: PID 6666",
  },
  {
    timestamp: "2026-09-08 23:46:00",
    level: "INFO",
    module: "guardian",
    message: "Whitelisted binary executed: code.exe",
  },
];

describe("Guardian Domain Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(statusApi, "fetchStatus").mockResolvedValue(mockSnapshot);
    vi.spyOn(guardianApi, "fetchTrustedProcesses").mockResolvedValue(["code.exe", "node.exe", "python.exe"]);
    vi.spyOn(operationsApi, "fetchLogs").mockResolvedValue(mockLogs);
  });

  afterEach(() => {
    telemetryCoordinator.stop();
    vi.restoreAllMocks();
  });

  it("renders GuardianOverview with status cards, approval queue, and anomaly diagnostics", async () => {
    await telemetryCoordinator.refreshNow();
    await guardianStore.loadTrustedProcesses(true);

    const html = renderToStaticMarkup(React.createElement(GuardianOverview));

    expect(html).toContain("Policy &amp; Protection Engine");
    expect(html).toContain("Process Anomaly Diagnostics");
    expect(html).toContain("malware.exe");
    expect(html).toContain("95%");
    expect(html).toContain("Whitelisted Processes");
    expect(html).toContain("code.exe");
  });

  it("renders GuardianAlertsView with severity badges, search, and remediation actions", async () => {
    await telemetryCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(GuardianAlertsView));

    expect(html).toContain("malware.exe");
    expect(html).toContain("PID: 6666");
    expect(html).toContain("critical");
    expect(html).toContain("Trust");
    expect(html).toContain("Ignore");
    expect(html).toContain("Dangerous");
  });

  it("renders PendingApprovalsView with explicit Authorize and Reject controls", async () => {
    await telemetryCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(PendingApprovalsView));

    expect(html).toContain("Kill Process Tree");
    expect(html).toContain("cmd-exec-01");
    expect(html).toContain("high Risk");
    expect(html).toContain("Authorize");
    expect(html).toContain("Reject");
  });

  it("renders TrustedProcessesView and TrustedProcessRow with whitelist items", async () => {
    await guardianStore.loadTrustedProcesses(true);

    const html = renderToStaticMarkup(React.createElement(TrustedProcessesView));

    expect(html).toContain("Trusted Processes Whitelist");
    expect(html).toContain("code.exe");
    expect(html).toContain("node.exe");
    expect(html).toContain("python.exe");
    expect(html).toContain("Add to Whitelist");

    const rowHtml = renderToStaticMarkup(
      React.createElement(TrustedProcessRow, { processName: "code.exe", onRemove: vi.fn(), onSelect: vi.fn() })
    );
    expect(rowHtml).toContain("code.exe");
    expect(rowHtml).toContain("Remove");
  });

  it("renders GuardianHistoryView and GuardianEventRow with audit logs", async () => {
    const html = renderToStaticMarkup(React.createElement(GuardianHistoryView));

    expect(html).toContain("Search security audit logs");
    expect(html).toContain("Security Events Only");

    const eventRowHtml = renderToStaticMarkup(
      React.createElement(GuardianEventRow, { entry: mockLogs[0], onSelect: vi.fn() })
    );
    expect(eventRowHtml).toContain("Anomalous process tree detected: PID 6666");
    expect(eventRowHtml).toContain("WARNING");
    expect(eventRowHtml).toContain("guardian");
  });

  it("renders GuardianStatusCard and ThreatSummaryCard", async () => {
    await telemetryCoordinator.refreshNow();

    const statusHtml = renderToStaticMarkup(React.createElement(GuardianStatusCard));
    expect(statusHtml).toContain("Policy &amp; Protection Engine");
    expect(statusHtml).toContain("ENFORCED");

    const threatHtml = renderToStaticMarkup(React.createElement(ThreatSummaryCard));
    expect(threatHtml).toContain("Threat Alerts Distribution");
    expect(threatHtml).toContain("Critical");
    expect(threatHtml).toContain("Medium");
  });

  it("renders ApprovalQueueCard with pending authorization count", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalQueueCard, {
        approvals: mockApprovals,
        inFlightApprovals: {},
        onAuthorize: vi.fn(),
        onReject: vi.fn(),
      })
    );
    expect(html).toContain("Pending Authorizations Queue");
    expect(html).toContain("1 pending");
    expect(html).toContain("Kill Process Tree");
  });

  it("renders GuardianHeader with sub-navigation tabs", () => {
    const html = renderToStaticMarkup(React.createElement(GuardianHeader));
    expect(html).toContain("Guardian &amp; Security Policy");
    expect(html).toContain("Overview");
    expect(html).toContain("Threat Alerts");
    expect(html).toContain("Approvals");
    expect(html).toContain("Trusted");
    expect(html).toContain("Audit History");
  });

  it("routes through GuardianWorkspace based on guardianSection", () => {
    uiStore.selectGuardianSection("overview");
    let html = renderToStaticMarkup(React.createElement(GuardianWorkspace));
    expect(html).toContain("Process Anomaly Diagnostics");

    uiStore.selectGuardianSection("alerts");
    html = renderToStaticMarkup(React.createElement(GuardianWorkspace));
    expect(html).toContain("Filter alerts by process");

    uiStore.selectGuardianSection("approvals");
    html = renderToStaticMarkup(React.createElement(GuardianWorkspace));
    expect(html).toContain("Search approvals by ID");

    uiStore.selectGuardianSection("trusted");
    html = renderToStaticMarkup(React.createElement(GuardianWorkspace));
    expect(html).toContain("Trusted Processes Whitelist");

    uiStore.selectGuardianSection("history");
    html = renderToStaticMarkup(React.createElement(GuardianWorkspace));
    expect(html).toContain("Search security audit logs");
  });
});
