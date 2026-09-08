/**
 * Component and View Tests for Analytics Workspace
 */

import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsWorkspace } from "./AnalyticsWorkspace";
import { TimelineChart } from "./components/TimelineChart";
import { MetricCard } from "./components/MetricCard";
import { analyticsStore } from "../../stores/analyticsStore";
import { uiStore } from "../../stores/uiStore";

describe("Analytics Workspace", () => {
  beforeEach(() => {
    analyticsStore.clearHistory();
    analyticsStore.processSnapshot({
      timestamp: 1000,
      cpu: { usage_percent: 32.5, cores_usage: [] },
      ram: { total_mb: 16000, used_mb: 6400, free_mb: 9600, usage_percent: 40.0 },
      system: {
        network: {
          interface_name: "wlan0",
          bytes_sent: 1000000,
          bytes_recv: 2000000,
          packets_sent: 10,
          packets_recv: 20,
          speed_mbps: 0.8,
        },
      },
      processes: {
        total_count: 85,
        top_cpu: [{ pid: 100, name: "core_engine.exe", cpu_percent: 15.2, ram_mb: 120, status: "running" }],
        top_ram: [{ pid: 101, name: "fluffy_brain.exe", cpu_percent: 2.1, ram_mb: 450, status: "running" }],
      },
    });
  });

  it("renders MetricCard with labels and stats", () => {
    const html = renderToStaticMarkup(
      React.createElement(MetricCard, {
        label: "CPU Utilization",
        current: 45.2,
        min: 10.0,
        max: 80.0,
        avg: 35.0,
        unit: "%",
      })
    );

    expect(html).toContain("CPU Utilization");
    expect(html).toContain("45.2");
    expect(html).toContain("Min:");
    expect(html).toContain("Max:");
  });

  it("renders TimelineChart SVG canvas", () => {
    const points = analyticsStore.getState().timeline;
    const html = renderToStaticMarkup(
      React.createElement(TimelineChart, {
        title: "CPU Timeline",
        metric: "cpuPercent",
        points,
        colorVar: "#8b5cf6",
      })
    );

    expect(html).toContain("CPU Timeline");
    expect(html).toContain("<svg");
  });

  it("renders ResourceTimelineView when view is timeline", () => {
    uiStore.selectAnalyticsSection("timeline");
    const html = renderToStaticMarkup(React.createElement(AnalyticsWorkspace));

    expect(html).toContain("Resource Timeline");
    expect(html).toContain("CPU Utilization Timeline");
    expect(html).toContain("RAM Consumption Timeline");
  });

  it("renders ProcessActivityView when view is activity", () => {
    uiStore.selectAnalyticsSection("activity");
    const html = renderToStaticMarkup(React.createElement(AnalyticsWorkspace));

    expect(html).toContain("Process Activity Breakdown");
    expect(html).toContain("core_engine.exe");
    expect(html).toContain("fluffy_brain.exe");
  });

  it("renders NetworkSpikesView when view is network_spikes", () => {
    uiStore.selectAnalyticsSection("network_spikes");
    const html = renderToStaticMarkup(React.createElement(AnalyticsWorkspace));

    expect(html).toContain("Network Spikes");
  });
});
