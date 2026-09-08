/**
 * Fluffy Desktop - Resource Timeline View
 * 
 * Historical time-series analytics for CPU, RAM, Disk, and Network metrics.
 * Derived from the authoritative telemetry stream with bounded in-memory sliding window.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import { useAnalyticsStore, analyticsStore, type ResourceTimelinePoint } from "../../../stores/analyticsStore";
import { useUiStore } from "../../../stores/uiStore";
import { TimelineChart } from "../components/TimelineChart";
import { MetricCard } from "../components/MetricCard";
import {
  BarChartIcon,
  CpuIcon,
  DatabaseIcon,
  WifiIcon,
  TrashIcon,
  ClockIcon,
} from "../../../components/common/Icons";

export const ResourceTimelineView: React.FC = () => {
  const { timeline, summary, selectedPoint, timeRange } = useAnalyticsStore();
  const selectInspectorItem = useUiStore((s) => s.selectInspectorItem);

  const handleSelectPoint = (point: ResourceTimelinePoint) => {
    analyticsStore.setSelectedPoint(point);
    selectInspectorItem({
      type: "analyticsPoint",
      id: point.id,
      title: `Telemetry @ ${point.timeStr}`,
      data: {
        timestamp: point.timestamp,
        time: point.timeStr,
        cpu_percent: point.cpuPercent,
        ram_percent: point.ramPercent,
        ram_used_mb: point.ramUsedMb,
        ram_total_mb: point.ramTotalMb,
        net_speed_mbps: point.netSpeedMbps,
        disk_percent: point.diskPercent,
        battery_percent: point.batteryPercent,
      },
    });
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header Toolbar */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BarChartIcon size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-text)",
                  margin: 0,
                }}
              >
                Resource Timeline
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {timeline.length} / 60 points
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Real-time rolling telemetry history derived from the authoritative stream.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {/* Time range toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "var(--color-surface-elevated)",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border)",
              padding: "2px",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {(["1m", "5m", "15m"] as const).map((range) => {
              const isActive = timeRange === range;
              return (
                <button
                  key={range}
                  type="button"
                  onClick={() => analyticsStore.setTimeRange(range)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "11px",
                    fontWeight: isActive ? "var(--font-weight-bold)" : "var(--font-weight-normal)",
                    backgroundColor: isActive ? "var(--color-accent)" : "transparent",
                    color: isActive ? "#ffffff" : "var(--color-text-muted)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {range}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => analyticsStore.clearHistory()}
            title="Clear rolling telemetry buffer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <TrashIcon size={12} />
            <span>Clear Buffer</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-5) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Metric Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          <MetricCard
            label="CPU Load"
            current={summary.cpu.current}
            min={summary.cpu.min}
            max={summary.cpu.max}
            avg={summary.cpu.avg}
            unit="%"
            colorVar="var(--color-accent)"
            icon={<CpuIcon size={14} />}
          />
          <MetricCard
            label="RAM Usage"
            current={summary.ram.current}
            min={summary.ram.min}
            max={summary.ram.max}
            avg={summary.ram.avg}
            unit="%"
            colorVar="var(--color-warning)"
            icon={<DatabaseIcon size={14} />}
          />
          <MetricCard
            label="Peak Network Speed"
            current={summary.network.maxSpeedMbps}
            unit="Mbps"
            colorVar="var(--color-success)"
            icon={<WifiIcon size={14} />}
          />
          <MetricCard
            label="Active Processes"
            current={summary.processCount}
            unit="tasks"
            colorVar="var(--color-accent)"
            icon={<ClockIcon size={14} />}
          />
        </div>

        {/* Charts Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <TimelineChart
            title="CPU Utilization Timeline"
            metric="cpuPercent"
            points={timeline}
            colorVar="var(--color-accent)"
            unit="%"
            maxScale={100}
            selectedPointId={selectedPoint?.id}
            onSelectPoint={handleSelectPoint}
          />
          <TimelineChart
            title="RAM Consumption Timeline"
            metric="ramPercent"
            points={timeline}
            colorVar="var(--color-warning)"
            unit="%"
            maxScale={100}
            selectedPointId={selectedPoint?.id}
            onSelectPoint={handleSelectPoint}
          />
        </div>

        {/* Full-width Network Activity Chart */}
        <TimelineChart
          title="Network Bandwidth Activity"
          metric="netSpeedMbps"
          points={timeline}
          colorVar="var(--color-success)"
          unit="Mbps"
          height={160}
          selectedPointId={selectedPoint?.id}
          onSelectPoint={handleSelectPoint}
        />
      </div>
    </div>
  );
};
