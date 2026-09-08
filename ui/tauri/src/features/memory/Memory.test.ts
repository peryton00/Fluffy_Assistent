import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryOverview } from "./views/MemoryOverview";
import { SessionsView } from "./views/SessionsView";
import { LongTermProfileView } from "./views/LongTermProfileView";
import { PreferencesView } from "./views/PreferencesView";
import { KnowledgeView } from "./views/KnowledgeView";
import { MemoryWorkspace } from "./MemoryWorkspace";
import { MemoryStatusCard } from "./components/MemoryStatusCard";
import { SessionCard } from "./components/SessionCard";
import { PreferenceRow } from "./components/PreferenceRow";
import { MemoryHeader } from "./components/MemoryHeader";

import { memoryStore } from "../../stores/memoryStore";
import { uiStore } from "../../stores/uiStore";
import * as memoryApi from "../../services/api/memory";
import type { ChatSessionSummary, UserProfile } from "../../types/contracts";

const mockProfile: UserProfile = {
  name: "Dr. Developer",
  facts: ["Prefers Rust & TypeScript", "Operates in UTC+5:30", "Uses dark theme"],
  frequent_apps: ["VS Code", "Windows Terminal", "Chrome"],
  learned_intents: {
    "open dev tools": "launch_vscode",
    "check system": "open_operations_overview",
  },
};

const mockSessions: ChatSessionSummary[] = [
  {
    id: "sess-abc-123",
    title: "System Architecture Discussion",
    message_count: 8,
    created: 1725800000,
    last_updated: 1725805000,
  },
  {
    id: "sess-xyz-789",
    title: "Network Cluster Troubleshooting",
    message_count: 14,
    created: 1725810000,
    last_updated: 1725815000,
  },
];

const mockPreferences: Record<string, unknown> = {
  theme: "dark",
  auto_refresh_telemetry: true,
  default_network_port: 9000,
};

describe("Memory Domain Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(memoryApi, "fetchLongTermMemory").mockResolvedValue(mockProfile);
    vi.spyOn(memoryApi, "fetchPreferences").mockResolvedValue(mockPreferences);
    vi.spyOn(memoryApi, "fetchChatSessions").mockResolvedValue(mockSessions);
    vi.spyOn(memoryApi, "fetchCurrentSessionId").mockResolvedValue("sess-abc-123");
    vi.spyOn(memoryApi, "fetchSessionStatus").mockResolvedValue({
      has_context: true,
      active_intent: "system_review",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders MemoryOverview with runtime context, profile highlights, and session snapshot", async () => {
    await memoryStore.loadProfile(true);
    await memoryStore.loadPreferences(true);
    await memoryStore.loadSessions(true);
    await memoryStore.loadActiveSession();

    const html = renderToStaticMarkup(React.createElement(MemoryOverview));

    expect(html).toContain("Runtime Memory State");
    expect(html).toContain("sess-abc-123");
    expect(html).toContain("Active Intent");
    expect(html).toContain("Dr. Developer");
    expect(html).toContain("Prefers Rust &amp; TypeScript");
    expect(html).toContain("VS Code");
    expect(html).toContain("System Architecture Discussion");
  });

  it("renders SessionsView with historical conversation sessions and message viewer canvas", async () => {
    await memoryStore.loadSessions(true);

    const html = renderToStaticMarkup(React.createElement(SessionsView));

    expect(html).toContain("Search sessions by title or session ID");
    expect(html).toContain("System Architecture Discussion");
    expect(html).toContain("Network Cluster Troubleshooting");
    expect(html).toContain("Select a Session to Preview");
  });

  it("renders LongTermProfileView with operator identity, learned facts, and frequent apps", async () => {
    await memoryStore.loadProfile(true);

    const html = renderToStaticMarkup(React.createElement(LongTermProfileView));

    expect(html).toContain("Operator Identity");
    expect(html).toContain("Dr. Developer");
    expect(html).toContain("Learned Behavioral Facts");
    expect(html).toContain("Prefers Rust &amp; TypeScript");
    expect(html).toContain("Frequent Applications");
    expect(html).toContain("Windows Terminal");
  });

  it("renders PreferencesView and PreferenceRow with key-value pairs", async () => {
    await memoryStore.loadPreferences(true);

    const html = renderToStaticMarkup(React.createElement(PreferencesView));

    expect(html).toContain("Memory Preferences Store");
    expect(html).toContain("auto_refresh_telemetry");
    expect(html).toContain("default_network_port");
    expect(html).toContain("9000");

    const rowHtml = renderToStaticMarkup(
      React.createElement(PreferenceRow, {
        prefKey: "theme",
        value: "dark",
        onUpdate: vi.fn(),
        onSelect: vi.fn(),
      })
    );
    expect(rowHtml).toContain("theme");
    expect(rowHtml).toContain("dark");
    expect(rowHtml).toContain("Edit");
  });

  it("renders KnowledgeView with indexed semantic facts and learned intent mappings", async () => {
    await memoryStore.loadProfile(true);

    const html = renderToStaticMarkup(React.createElement(KnowledgeView));

    expect(html).toContain("Knowledge &amp; Semantic Index");
    expect(html).toContain("RAG Vector Store Integration");
    expect(html).toContain("Indexed Knowledge Items");
    expect(html).toContain("Prefers Rust &amp; TypeScript");
    expect(html).toContain("Learned Intent Patterns");
    expect(html).toContain("open dev tools");
  });

  it("renders SessionCard with title, message count, and active badge", () => {
    const html = renderToStaticMarkup(
      React.createElement(SessionCard, {
        session: mockSessions[0],
        isActive: true,
        onSelect: vi.fn(),
        onDelete: vi.fn(),
      })
    );
    expect(html).toContain("System Architecture Discussion");
    expect(html).toContain("8 msgs");
    expect(html).toContain("Active");
  });

  it("renders MemoryStatusCard with active session metrics", async () => {
    await memoryStore.loadProfile(true);
    await memoryStore.loadPreferences(true);
    await memoryStore.loadActiveSession();

    const html = renderToStaticMarkup(React.createElement(MemoryStatusCard));

    expect(html).toContain("Runtime Memory State");
    expect(html).toContain("sess-abc-123");
    expect(html).toContain("Active Intent");
    expect(html).toContain("Reset Intent Context");
  });

  it("renders MemoryHeader with sub-navigation tabs", () => {
    const html = renderToStaticMarkup(React.createElement(MemoryHeader));
    expect(html).toContain("Context &amp; Memory Architecture");
    expect(html).toContain("Overview");
    expect(html).toContain("Sessions");
    expect(html).toContain("Long-Term Profile");
    expect(html).toContain("Preferences");
    expect(html).toContain("Knowledge");
  });

  it("routes through MemoryWorkspace based on memorySection", () => {
    uiStore.selectMemorySection("overview");
    let html = renderToStaticMarkup(React.createElement(MemoryWorkspace));
    expect(html).toContain("Runtime Memory State");

    uiStore.selectMemorySection("sessions");
    html = renderToStaticMarkup(React.createElement(MemoryWorkspace));
    expect(html).toContain("Search sessions by title");

    uiStore.selectMemorySection("profile");
    html = renderToStaticMarkup(React.createElement(MemoryWorkspace));
    expect(html).toContain("Learned Behavioral Facts");

    uiStore.selectMemorySection("preferences");
    html = renderToStaticMarkup(React.createElement(MemoryWorkspace));
    expect(html).toContain("Memory Preferences Store");

    uiStore.selectMemorySection("knowledge");
    html = renderToStaticMarkup(React.createElement(MemoryWorkspace));
    expect(html).toContain("Knowledge &amp; Semantic Index");
  });
});
