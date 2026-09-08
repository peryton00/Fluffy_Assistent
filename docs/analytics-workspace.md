# Fluffy Desktop — Analytics Domain Documentation

## 1. Overview & Purpose
The Analytics domain provides real-time historical insights and anomaly detection for host machine resource utilization. Rather than presenting decorative 3D or glowing charts, it acts as an operational telemetry analyzer answering: *"What has the machine been doing?"*

---

## 2. Views & Navigation Structure

1. **Resource Timeline (`timeline`)**
   - Renders lightweight SVG time-series graphs for CPU Utilization (%), RAM Consumption (%), and Network Bandwidth Activity (Mbps).
   - Displays rolling summary metric cards (Min, Max, Avg, Current values).
   - Interactive data points: Hovering displays exact timestamps and values; clicking populates the Contextual Inspector (`analyticsPoint`).
   - Time range selector (`1m`, `5m`, `15m`) and buffer purge action (`Clear Buffer`).

2. **Process Activity (`activity`)**
   - Real-time operational breakdown of highest CPU-load and highest Memory-consuming processes.
   - Shows Process Name, PID, active consumption, and visual distribution progress bars.
   - Clicking any process item routes context directly into the Inspector for termination or thread analysis.

3. **Network Spikes (`network_spikes`)**
   - Algorithmic anomaly detection for sudden bandwidth surges (&gt;= 2.0 Mbps).
   - Displays event log table containing exact timestamps, surge peak speeds (Mbps), deltas, and interface descriptions.
   - Clear empty state when network throughput is steady.

---

## 3. Architecture & Single-Source Telemetry Flow

```text
telemetryCoordinator (Single authoritative GET /status loop)
           ↓ (Subscription listener)
    analyticsStore (Sliding window: max 60 points)
           ↓ (Derived metrics & anomaly detection)
Analytics Views (ResourceTimelineView / ProcessActivityView / NetworkSpikesView)
           ↓
 Contextual Inspector (analyticsPoint / process selection)
```

- **Zero Duplicate Polling**: Analytics does not poll `GET /status` independently. It attaches as a passive subscriber to `telemetryCoordinator`.
- **Bounded In-Memory Ring Buffer**: History is capped at 60 points (sliding window) to prevent memory expansion over long sessions.
- **Adaptive Polling Aware**: Automatically reflects ACTIVE (2,000ms) or IDLE (10,000ms) telemetry cycles without additional CPU overhead.

---

## 4. Derived Metrics & Charting Rules
- **Zero Heavy Dependencies**: Uses pure, lightweight SVG canvas components (`TimelineChart.tsx`) without third-party chart runtime bloat.
- **Accessible & Contrast Compliant**: Built with theme CSS custom properties (`--color-primary-400`, `--color-info-400`, `--color-success-400`) ensuring readability in Fluffy Dark, Fluffy Light, and High Contrast themes.
- **No Fabricated Causal Claims**: Surfaced network spikes record factual throughput changes on monitored interfaces without guessing process attribution unless corroborated by the backend.
