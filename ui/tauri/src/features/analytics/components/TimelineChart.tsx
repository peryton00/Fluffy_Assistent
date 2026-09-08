/**
 * Fluffy Desktop - Lightweight SVG Timeline Chart Component
 * 
 * Accessible, zero-dependency SVG visualization for time-series telemetry.
 * Supports CPU %, RAM %, and Network Mbps with point hover & inspector integration.
 * Styled using Fluffy semantic design tokens.
 */

import React from "react";
import type { ResourceTimelinePoint } from "../../../stores/analyticsStore";

interface TimelineChartProps {
  points: ResourceTimelinePoint[];
  metric: "cpuPercent" | "ramPercent" | "netSpeedMbps";
  title: string;
  colorVar: string;
  unit?: string;
  maxScale?: number;
  height?: number;
  selectedPointId?: string;
  onSelectPoint?: (point: ResourceTimelinePoint) => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({
  points,
  metric,
  title,
  colorVar,
  unit = "%",
  maxScale = 100,
  height = 140,
  selectedPointId,
  onSelectPoint,
}) => {
  const width = 600;
  const padding = { top: 12, right: 16, bottom: 24, left: 36 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  if (points.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-4)",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-muted)",
        }}
      >
        <span>No telemetry data points available</span>
      </div>
    );
  }

  // Calculate actual dynamic scale if needed (e.g. for network speeds that can exceed 100 or stay below 10)
  const values = points.map((p) => p[metric] ?? 0);
  const dataMax = Math.max(...values, 0.1);
  const chartMax = metric === "netSpeedMbps" ? Math.max(Math.ceil(dataMax * 1.2), 5) : maxScale;

  // Build SVG path
  const coords = points.map((p, index) => {
    const x =
      points.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (index / (points.length - 1)) * innerWidth;
    const val = Math.min(Math.max(p[metric] ?? 0, 0), chartMax);
    const y = padding.top + innerHeight - (val / chartMax) * innerHeight;
    return { x, y, point: p, val };
  });

  const pathD = coords.reduce((acc, curr, idx) => {
    return `${acc} ${idx === 0 ? "M" : "L"} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }, "");

  // Area fill under curve
  const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(
    padding.top + innerHeight
  ).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

  const latestVal = values[values.length - 1] ?? 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: colorVar,
            }}
          />
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            {title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
            {latestVal.toFixed(1)}
          </span>
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{unit}</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", userSelect: "none" }}
          role="img"
          aria-label={`${title} timeline chart`}
        >
          {/* Background Grid Lines */}
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const labelVal = Math.round(chartMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="var(--color-border-subtle)"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-text-muted)"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaD} fill={colorVar} fillOpacity="0.12" />

          {/* Line Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={colorVar}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {coords.map(({ x, y, point, val }) => {
            const isSelected = selectedPointId === point.id;
            return (
              <circle
                key={point.id}
                cx={x}
                cy={y}
                r={isSelected ? 4.5 : 2.5}
                fill={isSelected ? "var(--color-accent)" : colorVar}
                stroke="var(--color-surface)"
                strokeWidth={isSelected ? 2 : 1}
                style={{ cursor: "pointer", transition: "r 0.15s ease" }}
                onClick={() => onSelectPoint && onSelectPoint(point)}
              >
                <title>{`${point.timeStr}: ${val.toFixed(1)} ${unit}`}</title>
              </circle>
            );
          })}

          {/* X Axis Time Labels */}
          {coords.length > 0 && (
            <>
              <text
                x={padding.left}
                y={height - 6}
                textAnchor="start"
                fill="var(--color-text-muted)"
                fontSize="9"
                fontFamily="monospace"
              >
                {coords[0].point.timeStr}
              </text>
              <text
                x={width - padding.right}
                y={height - 6}
                textAnchor="end"
                fill="var(--color-text-muted)"
                fontSize="9"
                fontFamily="monospace"
              >
                {coords[coords.length - 1].point.timeStr}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
