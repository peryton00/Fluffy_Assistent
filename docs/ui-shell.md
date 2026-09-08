# Fluffy Desktop — UI Phase 2: Application Shell Documentation

## Overview

This document describes the persistent master Workbench Application Shell established in **UI Phase 2** according to [`UI_WORKBENCH_SPECIFICATION.md`](../UI_WORKBENCH_SPECIFICATION.md).

---

## 1. Shell Component Hierarchy

```text
Shell (CSS Grid Layout)
├── TopBar
│   ├── Brand & Logo Identity
│   ├── Command / Search Input Trigger (Ctrl+K)
│   ├── Backend / Telemetry Status Indicator
│   ├── Visual Theme Cycle Trigger
│   └── Inspector Toggle Action
│
├── Main Work Area (Flexbox)
│   ├── ActivityBar (Primary 10-domain vertical switcher)
│   ├── ContextualSidebar (Dynamic secondary navigation views with collapse toggle)
│   ├── Workspace (Central container ready for domain feature canvases)
│   └── Inspector (Contextual drawer driven by uiStore.inspectorOpen)
│
├── StatusBar (Operational bottom telemetry line consuming telemetryStore)
│
└── CommandPalette (Modal dialog on Ctrl+K / Search with fuzzy domain/view jumping)
```

---

## 2. State Architecture & Ownership

State management strictly enforces decoupled concerns between presentation and domain telemetry:

| Store | Scope & State Owned | Consumer Components |
| :--- | :--- | :--- |
| **`uiStore`** | `activeDomain`, `activeSidebarView`, `sidebarCollapsed`, `inspectorOpen`, `commandPaletteOpen`, `theme` | `TopBar`, `ActivityBar`, `ContextualSidebar`, `Workspace`, `Inspector`, `CommandPalette`, `Shell` |
| **`telemetryStore`** | `snapshot`, `loading`, `error`, `connectionState`, `lastUpdated`, `lastError`, `activityState` | `TopBar`, `StatusBar` |

### Telemetry Guarantee:
- Zero components perform direct `/status` requests.
- The single centralized coordinator in `telemetryStore` provides adaptive 2s/10s polling.

---

## 3. Navigation Model

All 10 approved domains are mapped to secondary contextual navigation views:

| Domain | Default View | Secondary Views |
| :--- | :--- | :--- |
| **Operations** | `overview` | Overview, Quick Actions, Active Telemetry, Live Logs |
| **Chat** | `conversation` | Sessions, Conversation, Voice Controls |
| **Agents** | `runs` | Active Runs, Tasks, Execution Steps, Tools & MCP |
| **Guardian** | `overview` | Overview, Threat Alerts, Pending Approvals, Trusted Processes, History |
| **Systems** | `processes` | Processes, Applications, Startup, Network, Hardware |
| **Memory** | `overview` | Overview, Sessions, Long-Term Profile, Preferences, Knowledge |
| **Terminal** | `console` | Local Console, Agent Nodes |
| **Extensions** | `installed` | Installed, Code, Web UIs |
| **Analytics** | `timeline` | Resource Timeline, Process Activity, Network Spikes |
| **Settings** | `general` | General, Appearance, AI / Models, Voice, FTP, Advanced |

---

## 4. Keyboard Shortcuts & Accessibility

- **`Ctrl+K` / `Cmd+K`**: Opens global Command Palette modal.
- **`Escape`**: Closes Command Palette or closes Contextual Inspector.
- **Semantic HTML**: `<header role="banner">`, `<nav aria-label="...">`, `<main role="main">`, `<aside role="complementary">`, `<footer role="status">`.
- **Focus Rings**: Accessible `:focus-visible` outlines defined centrally in `src/styles/base.css`.
- **Reduced Motion**: Respects `@media (prefers-reduced-motion: reduce)`.

---

## 5. Theme Support

The persistent shell renders seamlessly across all three supported themes:
1. **`fluffyDark`** (Default high-density operational theme)
2. **`fluffyLight`** (Clean contrast light theme)
3. **`highContrast`** (Black/Yellow/Cyan accessibility theme)

---

## 6. Offline & Sovereign Invariants

- **Zero External Network Calls**: 0 CDNs, 0 Google Fonts, 0 cloud analytics.
- **Self-Contained Icons**: All icons in `src/components/common/Icons.tsx` are native offline SVG elements.
- **Backend Integrity**: Backend modifications = 0.
