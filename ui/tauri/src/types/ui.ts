/**
 * Fluffy Desktop - UI State Types
 * 
 * Defines state models strictly belonging to the frontend presentation layer.
 * Frontend UI state is decoupled from backend domain models.
 */

export type ActiveDomain =
  | "operations"
  | "chat"
  | "agents"
  | "guardian"
  | "systems"
  | "memory"
  | "terminal"
  | "extensions"
  | "analytics"
  | "settings";

export type GuardianSection = "overview" | "alerts" | "approvals" | "trusted" | "history";
export type MemorySection = "overview" | "sessions" | "profile" | "preferences" | "knowledge";
export type TerminalSection = "console" | "nodes";
export type ChatSection = "conversation" | "sessions" | "context" | "voice";
export type ExtensionSection = "installed" | "code" | "web_ui";
export type AnalyticsSection = "timeline" | "activity" | "network_spikes";
export type SettingsSection = "general" | "appearance" | "models" | "voice" | "ftp" | "advanced";

export interface NavigationItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

export interface DomainDefinition {
  id: ActiveDomain;
  label: string;
  icon: string;
  description: string;
  defaultView: string;
  views: NavigationItem[];
}

export const DOMAIN_DEFINITIONS: Record<ActiveDomain, DomainDefinition> = {
  operations: {
    id: "operations",
    label: "Operations",
    icon: "activity",
    description: "System overview, live telemetry, and quick actions",
    defaultView: "overview",
    views: [
      { id: "overview", label: "Overview" },
      { id: "quick_actions", label: "Quick Actions" },
      { id: "telemetry", label: "Active Telemetry" },
      { id: "logs", label: "Live Logs" },
    ],
  },
  chat: {
    id: "chat",
    label: "Chat",
    icon: "message-square",
    description: "Conversational assistant and voice interaction",
    defaultView: "conversation",
    views: [
      { id: "conversation", label: "Conversation" },
      { id: "sessions", label: "Sessions" },
      { id: "context", label: "Context" },
      { id: "voice", label: "Voice Controls" },
    ],
  },
  agents: {
    id: "agents",
    label: "Agents",
    icon: "bot",
    description: "Autonomous task execution and agent workflows",
    defaultView: "runs",
    views: [
      { id: "runs", label: "Active Runs" },
      { id: "tasks", label: "Tasks" },
      { id: "steps", label: "Execution Steps" },
      { id: "tools", label: "Tools & MCP" },
    ],
  },
  guardian: {
    id: "guardian",
    label: "Guardian",
    icon: "shield",
    description: "Behavioral anomaly detection and process security",
    defaultView: "overview",
    views: [
      { id: "overview", label: "Overview" },
      { id: "alerts", label: "Threat Alerts" },
      { id: "approvals", label: "Pending Approvals" },
      { id: "trusted", label: "Trusted Processes" },
      { id: "history", label: "History" },
    ],
  },
  systems: {
    id: "systems",
    label: "Systems",
    icon: "cpu",
    description: "Process hierarchy, applications, startup, and LAN",
    defaultView: "processes",
    views: [
      { id: "overview", label: "Overview" },
      { id: "processes", label: "Processes" },
      { id: "apps", label: "Applications" },
      { id: "startup", label: "Startup" },
      { id: "local_network", label: "Local Network" },
      { id: "network_intelligence", label: "Network Intelligence" },
      { id: "network", label: "Cluster Network" },
      { id: "hardware", label: "Hardware" },
    ],

  },
  memory: {
    id: "memory",
    label: "Memory",
    icon: "database",
    description: "Session memory, user profile, and knowledge base",
    defaultView: "overview",
    views: [
      { id: "overview", label: "Overview" },
      { id: "sessions", label: "Sessions" },
      { id: "profile", label: "Long-Term Profile" },
      { id: "preferences", label: "Preferences" },
      { id: "knowledge", label: "Knowledge" },
    ],
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    icon: "terminal",
    description: "Direct Core bridge terminal and remote node console",
    defaultView: "console",
    views: [
      { id: "console", label: "Local Console" },
      { id: "nodes", label: "Agent Nodes" },
    ],
  },
  extensions: {
    id: "extensions",
    label: "Extensions",
    icon: "puzzle",
    description: "Plugin hub, live editor, and custom web UIs",
    defaultView: "installed",
    views: [
      { id: "installed", label: "Installed" },
      { id: "code", label: "Code" },
      { id: "web_ui", label: "Web UIs" },
    ],
  },
  analytics: {
    id: "analytics",
    label: "Analytics",
    icon: "bar-chart",
    description: "Historical metrics, timelines, and network spikes",
    defaultView: "timeline",
    views: [
      { id: "timeline", label: "Resource Timeline" },
      { id: "activity", label: "Process Activity" },
      { id: "network_spikes", label: "Network Spikes" },
    ],
  },
  settings: {
    id: "settings",
    label: "Settings",
    icon: "settings",
    description: "Application configuration, AI models, voice, and FTP",
    defaultView: "general",
    views: [
      { id: "general", label: "General" },
      { id: "appearance", label: "Appearance" },
      { id: "models", label: "AI / Models" },
      { id: "voice", label: "Voice" },
      { id: "ftp", label: "FTP" },
      { id: "advanced", label: "Advanced" },
    ],
  },
};

export interface SidebarState {
  activeView: string;
  collapsed: boolean;
}

export type InspectorItemType =
  | "cpu"
  | "ram"
  | "disk"
  | "network"
  | "battery"
  | "subsystem"
  | "alert"
  | "log"
  | "confirmation"
  | "process"
  | "runningApplication"
  | "application"
  | "startup"
  | "machine"
  | "hardware"
  | "guardianAlert"
  | "pendingApproval"
  | "trustedProcess"
  | "guardianEvent"
  | "memorySession"
  | "memoryProfile"
  | "memoryPreference"
  | "knowledgeItem"
  | "agent"
  | "agentNode"
  | "terminalNode"
  | "chatMessage"
  | "chatContextItem"
  | "extension"
  | "analyticsPoint"
  | "settingItem";


export interface InspectorSelection {
  type: InspectorItemType;
  id: string;
  title: string;
  data: Record<string, unknown>;
}

export interface InspectorState {
  open: boolean;
  selectedItem: InspectorSelection | null;
}


export type ConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "AUTHENTICATION_FAILED"
  | "BACKEND_UNAVAILABLE"
  | "REQUEST_FAILED"
  | "STALE";

export type ThemeMode = "fluffyDark" | "fluffyLight" | "transparent" | "highContrast" | "custom";

export interface CommandPaletteState {
  open: boolean;
  query: string;
}

export type ActivityState = "ACTIVE" | "IDLE";

export interface UiNotification {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "success";
  timestamp: number;
}
