# Fluffy Desktop UI Workbench

The **Fluffy Desktop UI Workbench** is the official desktop frontend for the Fluffy Assistant platform, built with **Tauri v2**, **React 18**, **TypeScript**, and **Vite**.

It delivers a high-density, theme-aware industrial operations dashboard designed for real-time system monitoring, security anomaly inspection, autonomous agent interaction, interactive terminal administration, and local network observability.

---

## Directory Layout

```text
ui/tauri/
|-- src/
|   |-- app/                    # Root App shell, layout wrappers, and navigation bar
|   |-- assets/                 # Vector SVG icons, branding assets, and sound cues
|   |-- components/             # Reusable UI primitives (Modals, Badges, Tables, Inputs)
|   |   `-- common/             # Icons.tsx (Vector SVG icon library)
|   |-- features/               # Workspace feature modules
|   |   |-- analytics/          # Live throughput meters, usage graphs, network logs
|   |   |-- chat/               # Conversational AI assistant & voice visualizer
|   |   |-- extensions/         # Custom dynamic plugin viewer & manager
|   |   |-- operations/         # Normalization sweeps & process tree manager
|   |   |-- settings/           # Model selector, API keys, sovereignty controls
|   |   |-- systems/            # Systems overview, hardware diagnostics, Guardian status
|   |   `-- terminal/           # Interactive WebSocket console & LAN cluster selector
|   |-- services/               # API clients, WebSocket bridge, SSE stream consumer
|   |-- stores/                 # State management stores
|   |-- styles/                 # Global styles, variables, typography, and utility classes
|   |-- themes/                 # High-contrast industrial dark and light themes
|   |-- types/                  # TypeScript contracts and API schemas
|   `-- main.tsx                # React DOM root entrypoint
|-- src-tauri/                  # Native Rust Tauri host configuration
|   |-- src/
|   |   |-- main.rs             # Tauri binary entrypoint
|   |   `-- lib.rs              # Tauri command registrations and window lifecycle hooks
|   `-- tauri.conf.json         # Window size, title, and capability definitions
|-- package.json                # Frontend dependencies and dev scripts
|-- tsconfig.json               # TypeScript compiler options
`-- vite.config.ts              # Vite bundler configuration
```

---

## Key Workspaces & Features

1. **Systems Overview & Hardware**: Real-time meters for CPU, memory, per-core metrics, disk storage, battery health, bluetooth radios, and startup items.
2. **Guardian & Security**: Live behavioral risk evaluation, detected anomalies, rolling baselines progress, and incident audit log.
3. **Operations & Normalization**: Process inspection and termination, cache cleaning, RAM optimization sweeps, and installed application launcher.
4. **Terminal & Remote Cluster**: Real-time console streaming over WebSocket (Port 9003) and reverse TCP agent management (Port 9000).
5. **Chat & Voice**: Conversational AI interface supporting Server-Sent Events (SSE) token streaming, Vosk STT voice controls, Piper TTS playback, and interactive tool artifacts.
6. **Knowledge & Artifacts**: Code preview panels, markdown artifact rendering, and RAG vector store query inspection.
7. **Extensions & Tools**: Dynamic plugin status, manifest viewer, and live hot-reloading.
8. **Analytics & Observability**: Real-time network throughput graphs, historical system utilization trends, and activity logs.
9. **Settings & Sovereignty**: API keys configuration (Groq, OpenRouter, OpenAI, Anthropic, Ollama), voice model selection, FTP server controls, and theme toggling.

---

## Development Setup

### Prerequisites
- Node.js 18+ or 20+ LTS
- npm or pnpm
- Rust toolchain (for running within Tauri shell)

### Running the Frontend

```bash
# 1. Install dependencies
npm install

# 2. Run standalone in browser (for UI styling with mocked/live API)
npm run dev

# 3. Run within Tauri desktop window
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

The compiled desktop binary will be placed in `src-tauri/target/release/`.

---

## Design System & Rules

- **No Emojis**: All icons in the user interface are rendered as vector SVGs (`components/common/Icons.tsx`). No emoji characters are permitted in UI labels, badges, or notifications.
- **Theme Support**: The UI natively supports industrial dark and light modes with CSS custom properties (`--bg-primary`, `--text-primary`, `--border-color`, etc.).
- **Dense & Responsive**: Engineered for operations engineers and power users with high information density, clear typographic hierarchy, and micro-animations.
