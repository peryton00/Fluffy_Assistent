import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemsOverview } from "./views/SystemsOverview";
import { ProcessesView } from "./views/ProcessesView";
import { ApplicationsView } from "./views/ApplicationsView";
import { StartupView } from "./views/StartupView";
import { NetworkView } from "./views/NetworkView";
import { HardwareView } from "./views/HardwareView";
import { SystemsWorkspace } from "./SystemsWorkspace";
import { ProcessRow } from "./components/ProcessRow";
import { ProcessTree } from "./components/ProcessTree";
import { ApplicationCard } from "./components/ApplicationCard";
import { StartupRow } from "./components/StartupRow";
import { NetworkNodeCard } from "./components/NetworkNodeCard";
import { SystemsHeader } from "./components/SystemsHeader";

import { telemetryCoordinator } from "../../stores/telemetryStore";
import { appsStore } from "../../stores/appsStore";
import { networkStore } from "../../stores/networkStore";
import { uiStore } from "../../stores/uiStore";
import * as systemsApi from "../../services/api/systems";
import * as statusApi from "../../services/api/status";
import type { TelemetrySnapshot, ProcessInfo, InstalledApp, StartupApp, NetworkMachine } from "../../types/contracts";

const mockProcesses: ProcessInfo[] = [
  {
    pid: 1001,
    name: "chrome.exe",
    cpu_percent: 18.5,
    ram_mb: 450.2,
    status: "running",
    parent_pid: 1,
  },
  {
    pid: 1002,
    name: "code.exe",
    cpu_percent: 12.0,
    ram_mb: 320.0,
    status: "running",
    parent_pid: 1001,
  },
  {
    pid: 1003,
    name: "node.exe",
    cpu_percent: 5.5,
    ram_mb: 128.0,
    status: "running",
    parent_pid: 1002,
  },
];

const mockStartupApps: StartupApp[] = [
  {
    name: "Discord",
    command: "C:\\Users\\user\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe",
    enabled: true,
    source: "HKCU Run",
  },
  {
    name: "Spotify",
    command: "C:\\Users\\user\\AppData\\Roaming\\Spotify\\Spotify.exe --autostart",
    enabled: false,
    source: "Startup Folder",
  },
];

const mockInstalledApps: InstalledApp[] = [
  {
    id: "app-vscode",
    name: "Visual Studio Code",
    publisher: "Microsoft Corporation",
    version: "1.92.0",
    exe_path: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
    location: "C:\\Program Files\\Microsoft VS Code",
    size_kb: 450000,
    icon_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  },
  {
    id: "app-git",
    name: "Git version 2.45.0",
    publisher: "The Git Development Community",
    version: "2.45.0",
    exe_path: "C:\\Program Files\\Git\\cmd\\git.exe",
    uninstall_string: "C:\\Program Files\\Git\\unins000.exe",
  },
];

const mockMachines: NetworkMachine[] = [
  {
    machine_id: "node-1",
    name: "Lab-Rig-01",
    ip: "192.168.1.101",
    port: 9000,
    online: true,
  },
  {
    machine_id: "node-2",
    name: "Build-Server",
    ip: "192.168.1.102",
    port: 9000,
    online: false,
  },
];

const mockSnapshot: TelemetrySnapshot = {
  status: "active",
  schema_version: "2.0.0",
  timestamp: Date.now(),
  system: {
    cpu: {
      usage_percent: 35.0,
      frequency_mhz: 3600,
      cores_usage: [30, 40, 35, 35, 30, 40, 35, 35],
    },
    ram: {
      total_mb: 16384,
      used_mb: 8192,
      free_mb: 8192,
      usage_percent: 50.0,
    },
    disks: [
      {
        name: "OS (C:)",
        mount_point: "C:",
        total_bytes: 512 * 1024 * 1024 * 1024,
        available_bytes: 256 * 1024 * 1024 * 1024,
        used_percent: 50.0,
      },
    ],
    network: {
      interface_name: "Ethernet",
      bytes_sent: 1048576,
      bytes_recv: 2097152,
      packets_sent: 1000,
      packets_recv: 2000,
      speed_mbps: 1000,
    },
    battery: {
      percent: 92,
      is_charging: true,
      time_remaining_minutes: 120,
    },
    processes: {
      total_count: 142,
      top_cpu: mockProcesses,
      top_ram: mockProcesses,
      top_disk: mockProcesses,
    },
    persistence: mockStartupApps,
  },
};

describe("Systems Domain Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(statusApi, "fetchStatus").mockResolvedValue(mockSnapshot);
    vi.spyOn(systemsApi, "fetchApplications").mockResolvedValue(mockInstalledApps);
    vi.spyOn(systemsApi, "getNetworkRole").mockResolvedValue({ ok: true, role: "admin" });
    vi.spyOn(systemsApi, "getAdminMachines").mockResolvedValue({
      ok: true,
      machines: mockMachines,
      active_machine: "node-1",
    });
    vi.spyOn(systemsApi, "getAdminMachineData").mockResolvedValue({
      ok: true,
      data: {
        name: "Lab-Rig-01",
        ip: "192.168.1.101",
        cpu_percent: 14.2,
        ram_percent: 42.0,
        disk_percent: 60.5,
        processes: {
          top_cpu: [{ pid: 501, name: "agent.exe", cpu_percent: 5.0, ram_mb: 50, status: "running" }],
        },
      },
    });
  });

  afterEach(() => {
    telemetryCoordinator.stop();
    networkStore.stopPolling();
    vi.restoreAllMocks();
  });

  it("renders SystemsOverview with command center telemetry and quick jump cards", async () => {
    await telemetryCoordinator.refreshNow();
    await appsStore.loadApps(true);
    await networkStore.refreshNow();

    const html = renderToStaticMarkup(React.createElement(SystemsOverview));

    expect(html).toContain("Systems Command Center");
    expect(html).toContain("142"); // Active processes count
    expect(html).toContain("Applications");
    expect(html).toContain("Startup Entries");
    expect(html).toContain("LAN Nodes");
    expect(html).toContain("chrome.exe");
  });

  it("renders ProcessesView with processes table and switches between flat and hierarchy modes", async () => {
    await telemetryCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(ProcessesView));

    expect(html).toContain("Process Explorer");
    expect(html).toContain("chrome.exe");
    expect(html).toContain("code.exe");
    expect(html).toContain("1001");
    expect(html).toContain("18.5%");
  });

  it("renders ProcessRow and ProcessTree components with structured hierarchy", () => {
    const rowHtml = renderToStaticMarkup(
      React.createElement(ProcessRow, { process: mockProcesses[0] })
    );
    expect(rowHtml).toContain("chrome.exe");
    expect(rowHtml).toContain("1001");
    expect(rowHtml).toContain("Terminate chrome.exe");

    const treeCollapsedHtml = renderToStaticMarkup(
      React.createElement(ProcessTree, { processes: mockProcesses })
    );
    expect(treeCollapsedHtml).toContain("chrome.exe");
    expect(treeCollapsedHtml).toContain("Expand 1 child processes");

    const treeExpandedHtml = renderToStaticMarkup(
      React.createElement(ProcessTree, { processes: mockProcesses, defaultExpanded: true })
    );
    expect(treeExpandedHtml).toContain("chrome.exe");
    expect(treeExpandedHtml).toContain("code.exe");
    expect(treeExpandedHtml).toContain("node.exe");
  });

  it("renders ApplicationsView and ApplicationCard with real icons and metadata", async () => {
    await appsStore.loadApps(true);

    const html = renderToStaticMarkup(React.createElement(ApplicationsView));

    expect(html).toContain("Applications Manager");
    expect(html).toContain("Visual Studio Code");
    expect(html).toContain("Git version 2.45.0");
    expect(html).toContain("Microsoft Corporation");
    expect(html).toContain("Deep Re-scan");

    const cardHtml = renderToStaticMarkup(
      React.createElement(ApplicationCard, { app: mockInstalledApps[0] })
    );
    expect(cardHtml).toContain("Visual Studio Code");
    expect(cardHtml).toContain("Launch");
    expect(cardHtml).toContain("data:image/png;base64");
  });

  it("renders StartupView and StartupRow with registry/folder sources and status badges", async () => {
    await telemetryCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(StartupView));

    expect(html).toContain("Startup &amp; Persistence Manager");
    expect(html).toContain("Discord");
    expect(html).toContain("Spotify");
    expect(html).toContain("Add Entry");

    const rowHtml = renderToStaticMarkup(
      React.createElement(StartupRow, { entry: mockStartupApps[0] })
    );
    expect(rowHtml).toContain("Discord");
    expect(rowHtml).toContain("Enabled");
    expect(rowHtml).toContain("HKCU Run");
  });

  it("renders NetworkView and NetworkNodeCard with cluster admin and machine nodes", async () => {
    await networkStore.refreshNow();

    const html = renderToStaticMarkup(React.createElement(NetworkView));

    expect(html).toContain("Distributed LAN &amp; Peer Nodes");
    expect(html).toContain("ADMIN");
    expect(html).toContain("Lab-Rig-01");
    expect(html).toContain("Build-Server");
    expect(html).toContain("Active Remote Target");

    const cardHtml = renderToStaticMarkup(
      React.createElement(NetworkNodeCard, { machine: mockMachines[0], isActive: true })
    );
    expect(cardHtml).toContain("Lab-Rig-01");
    expect(cardHtml).toContain("192.168.1.101:9000");
    expect(cardHtml).toContain("ACTIVE TARGET");
  });

  it("renders HardwareView with CPU, RAM, disk mount points, network interfaces, and power telemetry", async () => {
    await telemetryCoordinator.refreshNow();

    const html = renderToStaticMarkup(React.createElement(HardwareView));

    expect(html).toContain("Hardware &amp; Device Telemetry");
    expect(html).toContain("Processor (CPU)");
    expect(html).toContain("35.0%");
    expect(html).toContain("Physical RAM");
    expect(html).toContain("Storage Disks &amp; Filesystem Mounts");
    expect(html).toContain("C:");
    expect(html).toContain("Network Interface");
    expect(html).toContain("Ethernet");
    expect(html).toContain("Battery &amp; Power Supply");
    expect(html).toContain("92%");
  });

  it("renders SystemsHeader with host and target machine status indicator", () => {
    const html = renderToStaticMarkup(
      React.createElement(SystemsHeader, { title: "Custom Title", subtitle: "Custom Subtitle" })
    );
    expect(html).toContain("Custom Title");
    expect(html).toContain("Custom Subtitle");
    expect(html).toContain("REMOTE: Lab-Rig-01");
  });

  it("correctly routes through SystemsWorkspace based on activeSidebarView in uiStore", () => {
    uiStore.setActiveDomain("systems");

    uiStore.setActiveSidebarView("overview");
    let html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Systems Command Center");

    uiStore.setActiveSidebarView("processes");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Process Explorer");

    uiStore.setActiveSidebarView("apps");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Applications Manager");

    uiStore.setActiveSidebarView("startup");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Startup &amp; Persistence Manager");

    uiStore.setActiveSidebarView("local_network");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Local Host Network Observability");

    uiStore.setActiveSidebarView("network_intelligence");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Network Intelligence (N9)");

    uiStore.setActiveSidebarView("network");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Distributed LAN &amp; Peer Nodes");

    uiStore.setActiveSidebarView("hardware");
    html = renderToStaticMarkup(React.createElement(SystemsWorkspace));
    expect(html).toContain("Hardware &amp; Device Telemetry");
  });
});

