# Fluffy Desktop — Operations Workspace Architecture (Phase 3)

## Overview

The **Operations Workspace** serves as Fluffy's primary command center and live operational surface. It provides dense, high-frequency system monitoring, host subsystem health status, security overview, pending action authorizations, operational routines, and real-time execution log streams.

---

## Workspace Structure & Sub-Views

The Operations domain defines 4 distinct operational views selectable from the contextual sidebar:

```text
Operations
├── Overview          (Default: High-level metrics, subsystems health, pending approvals, recent logs)
├── Quick Actions     (Dedicated surface for System Normalization, Speed Benchmark, Navigation)
├── Active Telemetry  (Deep per-core CPU bars, RAM buffers, filesystem mounts, network interfaces)
└── Live Logs         (5-second streaming execution log journal with severity & text filtering)
```

---

## Component Architecture

```text
OperationsWorkspace
├── OperationsOverview
│   ├── OperationalHeader
│   ├── PendingConfirmationsBanner
│   ├── TelemetryMetricCard (CPU, RAM, Disk, Network, Battery)
│   ├── SubsystemsStatusCard (Core, Brain, Guardian, Memory)
│   ├── GuardianSummaryCard
│   ├── QuickActionsCard
│   └── RecentActivityFeed
├── QuickActionsView
│   ├── OperationalHeader
│   ├── Normalize System Routine (POST /normalize)
│   ├── Speed & Latency Benchmark (POST /net-speed)
│   └── Workspace Navigation Shortcuts
├── ActiveTelemetryView
│   ├── OperationalHeader
│   ├── Processor Cores & Frequency Panel (multi-core distribution meters)
│   ├── Memory Allocation & Buffers Panel
│   ├── Filesystem Mounts Panel
│   ├── Network Interface Panel
│   └── Battery & Power State Panel
└── LiveLogsView
    ├── OperationalHeader
    ├── Log Stream Filter & Search Bar
    ├── Live Monospace Console Canvas
    └── Stream Pause / Auto-scroll Controls
```

---

## State Flow & Data Coordination

```text
[Backend: Python Brain HTTP 5123]
       │
       ├── GET /status (2s active / 10s idle) ──> telemetryCoordinator ──> useTelemetryStore() ──> Operations Components
       ├── GET /logs (5s cadence)              ──> logsCoordinator      ──> useLogsStore()       ──> ActivityFeed / LiveLogs
       ├── POST /normalize                     ──> operations.ts API    ──> QuickActionsCard / QuickActionsView
       ├── POST /net-speed                     ──> operations.ts API    ──> QuickActionsCard / QuickActionsView
       └── POST /command                       ──> operations.ts API    ──> PendingConfirmationsBanner
```

---

## Invariants & Guardrails

1. **Zero Duplicate Polling**:
   - Status telemetry is consumed exclusively via `telemetryStore`.
   - Execution logs are polled on a single 5,000ms loop via `logsStore`.
2. **Zero Direct Network Calls in Components**:
   - All HTTP communication routes through `src/services/api/operations.ts` and `apiClient`.
3. **Inspector Binding**:
   - Clicking any metric card, log event, or security alert populates `uiStore.selectedItem` and opens the contextual Inspector drawer for deep property inspection.
4. **Offline First**:
   - Zero CDN requests, zero runtime external fonts, self-contained SVG icon primitives in `src/components/common/Icons.tsx`.
5. **Backend Integrity**:
   - No Python Brain, Rust Core, Guardian, or backend API routes were modified.

---

## Build and Test Verification

- Test suite: `npm test` passing with 51 unit and integration tests across 8 test suites.
- TypeScript compiler (`tsc`) passing with 0 errors.
- Production build (`vite build`) producing clean optimized bundle artifacts.
