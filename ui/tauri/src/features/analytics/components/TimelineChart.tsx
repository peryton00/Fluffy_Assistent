/**
 * Fluffy Desktop - Modern Spline Timeline Chart Component
 * 
 * High-precision, zero-dependency SVG visualization for time-series telemetry.
 * Features smooth Catmull-Rom cubic Bezier splines, multi-stop neon gradient fills,
 * glow layer filters, and interactive crosshair scrubbing.
 */

import React, { useState, useId } from "react";
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

/**
 * Computes smooth Catmull-Rom to Cubic Bezier path coordinates.
 */
function getSmoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  if (coords.length === 2) {
    return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} L ${coords[1].x.toFixed(1)} ${coords[1].y.toFixed(1)}`;
  }

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i < coords.length - 2 ? coords[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
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
  const chartId = useId().replace(/:/g, "_");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const width = 600;
  const padding = { top: 16, right: 16, bottom: 26, left: 38 };

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

  // Calculate scales and summary metrics
  const values = points.map((p) => p[metric] ?? 0);
  const dataMax = Math.max(...values, 0.1);
  const dataMin = Math.min(...values);
  const dataAvg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const chartMax = metric === "netSpeedMbps" ? Math.max(Math.ceil(dataMax * 1.25), 5) : maxScale;

  // Build coordinate map
  const coords = points.map((p, index) => {
    const x =
      points.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (index / (points.length - 1)) * innerWidth;
    const rawVal = p[metric] ?? 0;
    const clampedVal = Math.min(Math.max(rawVal, 0), chartMax);
    const y = padding.top + innerHeight - (clampedVal / chartMax) * innerHeight;
    return { x, y, point: p, val: rawVal };
  });

  const smoothLineD = getSmoothPath(coords);
  const baselineY = (padding.top + innerHeight).toFixed(1);
  const areaD = `${smoothLineD} L ${coords[coords.length - 1].x.toFixed(1)} ${baselineY} L ${coords[0].x.toFixed(1)} ${baselineY} Z`;

  const latestVal = values[values.length - 1] ?? 0;
  const activePoint = hoveredIndex !== null && coords[hoveredIndex] ? coords[hoveredIndex] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    
    // Find closest point by X coordinate
    let closestIdx = 0;
    let minDiff = Infinity;
    coords.forEach((c, idx) => {
      const diff = Math.abs(c.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoveredIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        position: "relative",
      }}
    >
      {/* Header with Live Stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: colorVar,
              boxShadow: `0 0 8px ${colorVar}`,
            }}
          />
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            {title}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {/* Min / Max / Avg Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "10px",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-bg)",
              padding: "2px 6px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <span>Min: <strong style={{ color: "var(--color-text)" }}>{dataMin.toFixed(1)}</strong></span>
            <span>•</span>
            <span>Avg: <strong style={{ color: "var(--color-text)" }}>{dataAvg.toFixed(1)}</strong></span>
            <span>•</span>
            <span>Max: <strong style={{ color: "var(--color-text)" }}>{dataMax.toFixed(1)}</strong></span>
          </div>

          {/* Current Live Value */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "3px" }}>
            <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-bold)", fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
              {(activePoint ? activePoint.val : latestVal).toFixed(1)}
            </span>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>{unit}</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", userSelect: "none", cursor: "crosshair" }}
          role="img"
          aria-label={`${title} timeline chart`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Multi-stop glowing vertical gradient */}
            <linearGradient id={`grad_${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorVar} stopOpacity="0.32" />
              <stop offset="50%" stopColor={colorVar} stopOpacity="0.12" />
              <stop offset="90%" stopColor={colorVar} stopOpacity="0.02" />
              <stop offset="100%" stopColor={colorVar} stopOpacity="0.00" />
            </linearGradient>

            {/* Glowing filter for primary stroke */}
            <filter id={`glow_${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid Lines & Values */}
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
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  strokeOpacity="0.7"
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
          <path d={areaD} fill={`url(#grad_${chartId})`} />

          {/* Glow Line Underlay */}
          <path
            d={smoothLineD}
            fill="none"
            stroke={colorVar}
            strokeWidth="3.5"
            strokeOpacity="0.3"
            filter={`url(#glow_${chartId})`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Crisp Primary Spline Stroke */}
          <path
            d={smoothLineD}
            fill="none"
            stroke={colorVar}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Crosshair & Cursor Line */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padding.top}
                x2={activePoint.x}
                y2={padding.top + innerHeight}
                stroke={colorVar}
                strokeWidth="1"
                strokeDasharray="2 2"
                strokeOpacity="0.8"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="6"
                fill={colorVar}
                fillOpacity="0.25"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="3.5"
                fill="#ffffff"
                stroke={colorVar}
                strokeWidth="2"
              />
            </g>
          )}

          {/* Data Points */}
          {coords.map(({ x, y, point, val }, idx) => {
            const isSelected = selectedPointId === point.id;
            const isHovered = hoveredIndex === idx;
            return (
              <circle
                key={point.id}
                cx={x}
                cy={y}
                r={isSelected ? 5 : isHovered ? 4 : 2.5}
                fill={isSelected ? "#ffffff" : colorVar}
                stroke={isSelected ? colorVar : "var(--color-surface)"}
                strokeWidth={isSelected ? 2.5 : 1}
                style={{ cursor: "pointer", transition: "r 0.15s ease, fill 0.15s ease" }}
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
              {activePoint && (
                <text
                  x={activePoint.x}
                  y={height - 6}
                  textAnchor="middle"
                  fill="var(--color-text)"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {activePoint.point.timeStr}
                </text>
              )}
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
