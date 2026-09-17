/**
 * Fluffy Desktop - Agent Workspace UI Component Tests
 * Phase 11: Agent Execution Workspace UI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentWorkspace } from "./AgentWorkspace";
import { ExecutionHeader } from "./ExecutionHeader";
import { ConfirmationBanner } from "./ConfirmationBanner";
import { PlanStepTimeline } from "./PlanStepTimeline";
import { ExecutionInspector } from "./ExecutionInspector";
import { LiveEventTimeline } from "./LiveEventTimeline";
import { EvidencePanel } from "./EvidencePanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { executionStore } from "../../stores/executionStore";
import type { AgentTask, AgentEvent, PlanStep, ArtifactItem } from "../../types/agent";
import type { EvidenceItem } from "../../stores/executionStore";

describe("Agent Workspace UI Test Suite", () => {
  beforeEach(() => {
    // Reset store state
    executionStore.setState({
      tasks: [],
      activeTaskId: null,
      selectedTask: null,
      plan: null,
      steps: [],
      events: [],
      selectedStepId: null,
      pendingConfirmation: null,
      artifacts: [],
      evidence: [],
      status: "idle",
      isRunning: false,
      result: null,
      error: null,
      loading: false,
      connectionState: "CONNECTED",
      lastFetched: null,
    });
  });

  it("renders AgentWorkspace in idle/empty state", () => {
    const html = renderToStaticMarkup(React.createElement(AgentWorkspace));
    expect(html).toContain("Autonomous Execution Workspace");
    expect(html).toContain("Execution Plan (0 Steps)");
    expect(html).toContain("Live Timeline (0)");
    expect(html).toContain("Evidence (0)");
    expect(html).toContain("Artifacts (0)");
  });

  it("renders ExecutionHeader with active goal, status, duration and sovereignty badge", () => {
    const mockTask: AgentTask = {
      task_id: "task_test_hdr",
      user_request: "Perform SIH investigation",
      goal: "SIH Investigation Goal",
      created_at: 1000,
      updated_at: 1050,
      status: "executing",
      priority: 1,
    };

    const html = renderToStaticMarkup(
      React.createElement(ExecutionHeader, {
        task: mockTask,
        status: "executing",
        isRunning: true,
        onCancel: vi.fn(),
        onRefresh: vi.fn(),
        onNewTaskClick: vi.fn(),
      })
    );

    expect(html).toContain("SIH Investigation Goal");
    expect(html).toContain("task_test_hdr");
    expect(html).toContain("RUNNING");
    expect(html).toContain("Local Sovereignty");
    expect(html).toContain("Cancel");
    expect(html).toContain("New Run");
  });

  it("renders ConfirmationBanner with action, risk level and authorize/deny actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmationBanner, {
        confirmation: {
          confirmation_id: "conf_sec_1",
          step_id: "s2_net",
          action: "ScanNetworkInterfaces",
          reason: "Active network interface port sweep requires confirmation.",
          risk_level: "medium",
        },
        loading: false,
        onConfirm: vi.fn(),
        onDeny: vi.fn(),
      })
    );

    expect(html).toContain("Security Gate Authorization Required: ScanNetworkInterfaces");
    expect(html).toContain("Active network interface port sweep requires confirmation.");
    expect(html).toContain("medium risk");
    expect(html).toContain("Authorize &amp; Resume");
    expect(html).toContain("Deny");
  });

  it("renders PlanStepTimeline with all capability step badges and status states", () => {
    const steps: PlanStep[] = [
      {
        step_id: "s1_know",
        objective: "Retrieve incident documentation",
        dependencies: [],
        status: "completed",
        execution_type: "knowledge",
        attempt_count: 1,
      },
      {
        step_id: "s2_net",
        objective: "Inspect network ports",
        dependencies: ["s1_know"],
        status: "executing",
        execution_type: "tool",
        attempt_count: 2,
      },
      {
        step_id: "s3_ai",
        objective: "Correlate telemetry observations",
        dependencies: ["s2_net"],
        status: "pending",
        execution_type: "model",
        attempt_count: 0,
      },
      {
        step_id: "s4_art",
        objective: "Generate final markdown report",
        dependencies: ["s3_ai"],
        status: "pending",
        execution_type: "artifact",
        attempt_count: 0,
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(PlanStepTimeline, {
        steps,
        selectedStepId: "s2_net",
        onSelectStep: vi.fn(),
      })
    );

    expect(html).toContain("Retrieve incident documentation");
    expect(html).toContain("Inspect network ports");
    expect(html).toContain("Correlate telemetry observations");
    expect(html).toContain("Generate final markdown report");
    expect(html).toContain("KNOWLEDGE");
    expect(html).toContain("TOOL");
    expect(html).toContain("MODEL");
    expect(html).toContain("ARTIFACT");
    expect(html).toContain("Retry 2");
  });

  it("renders ExecutionInspector for Tool, Model, Knowledge, and Artifact capabilities safely", () => {
    const toolStep: PlanStep = {
      step_id: "s_tool",
      objective: "List active ports",
      status: "completed",
      execution_type: "tool",
      tool_requirement: "rust:Network.ListConnections",
      input_parameters: { port_range: "80-443" },
      output: { active_ports: [80, 443] },
      attempt_count: 1,
      dependencies: [],
    };

    const toolHtml = renderToStaticMarkup(React.createElement(ExecutionInspector, { step: toolStep }));
    expect(toolHtml).toContain("List active ports");
    expect(toolHtml).toContain("rust:Network.ListConnections");
    expect(toolHtml).toContain("Zero-Exfiltration Local");
    expect(toolHtml).toContain("active_ports");

    const modelStep: PlanStep = {
      step_id: "s_model",
      objective: "Analyze incident patterns",
      status: "executing",
      execution_type: "model",
      model_requirement: { quality: "high" },
      attempt_count: 1,
      dependencies: [],
    };

    const modelHtml = renderToStaticMarkup(React.createElement(ExecutionInspector, { step: modelStep }));
    expect(modelHtml).toContain("Analyze incident patterns");
    expect(modelHtml).toContain("Confidential local inference; zero cloud dispatch.");
  });

  it("renders LiveEventTimeline in reverse chronological order", () => {
    const events: AgentEvent[] = [
      {
        event_id: "evt_1",
        event_type: "task_started",
        task_id: "task_1",
        timestamp: 1000,
        source: "orchestrator",
        payload: {},
      },
      {
        event_id: "evt_2",
        event_type: "knowledge_completed",
        task_id: "task_1",
        step_id: "s1_know",
        timestamp: 1005,
        source: "orchestrator",
        payload: { document_count: 3 },
      },
    ];

    const html = renderToStaticMarkup(React.createElement(LiveEventTimeline, { events }));
    expect(html).toContain("task started");
    expect(html).toContain("knowledge completed");
    expect(html).toContain("[s1_know]");
  });

  it("renders EvidencePanel and ArtifactsPanel with local integrity verification", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev_1",
        type: "knowledge",
        title: "Knowledge: incident report",
        summary: "Retrieved local incident report",
        timestamp: 1000,
      },
      {
        id: "ev_2",
        type: "network",
        title: "Network Observation: port_scan",
        summary: "Local port scan verified",
        timestamp: 1005,
      },
    ];

    const evHtml = renderToStaticMarkup(React.createElement(EvidencePanel, { evidence }));
    expect(evHtml).toContain("Knowledge: incident report");
    expect(evHtml).toContain("Network Observation: port_scan");
    expect(evHtml).toContain("Local Verified");

    const artifacts: ArtifactItem[] = [
      {
        artifact_id: "art_1",
        name: "incident_report_2026.md",
        format: "markdown",
        size: 4096,
        hash: "sha256-abcdef1234567890",
        validation_status: "valid",
        is_local: true,
      },
    ];

    const artHtml = renderToStaticMarkup(React.createElement(ArtifactsPanel, { artifacts }));
    expect(artHtml).toContain("incident_report_2026.md");
    expect(artHtml).toContain("4096 bytes");
    expect(artHtml).toContain("Verified Valid");
    expect(artHtml).toContain("Local File");
  });
});
