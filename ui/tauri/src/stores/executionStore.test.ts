/**
 * Fluffy Desktop - Execution Store Tests
 * Phase 11: Agent Execution Workspace UI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExecutionStoreManager } from "./executionStore";
import type { AgentTask, AgentPlan, AgentEvent } from "../types/agent";

describe("ExecutionStoreManager", () => {
  let store: ExecutionStoreManager;

  beforeEach(() => {
    store = new ExecutionStoreManager();
  });

  afterEach(() => {
    store.stopPolling();
    vi.clearAllTimers();
  });

  it("normalizes an initial task without events", () => {
    const task: AgentTask = {
      task_id: "task_1",
      user_request: "Perform diagnostics",
      goal: "Perform diagnostics",
      created_at: 1000,
      updated_at: 1000,
      status: "ready",
      priority: 1,
    };

    const plan: AgentPlan = {
      plan_id: "plan_1",
      task_id: "task_1",
      goal: "Perform diagnostics",
      steps: [
        {
          step_id: "s1",
          objective: "Inspect hardware",
          dependencies: [],
          status: "pending",
          attempt_count: 0,
        },
      ],
    };

    const normalized = store.normalizeTaskState(task, plan, null, null, []);
    expect(normalized.status).toBe("ready");
    expect(normalized.isRunning).toBe(true);
    expect(normalized.steps).toHaveLength(1);
    expect(normalized.steps![0].status).toBe("pending");
  });

  it("replays task lifecycle events (start, complete, fail, cancel)", () => {
    const task: AgentTask = {
      task_id: "task_lifecycle",
      user_request: "Run task",
      created_at: 1000,
      updated_at: 1000,
      status: "ready",
      priority: 1,
    };

    const events: AgentEvent[] = [
      {
        event_id: "e1",
        event_type: "task_started",
        task_id: "task_lifecycle",
        timestamp: 1001,
        source: "orchestrator",
        payload: {},
      },
      {
        event_id: "e2",
        event_type: "task_completed",
        task_id: "task_lifecycle",
        timestamp: 1010,
        source: "orchestrator",
        payload: { summary: "All done" },
      },
    ];

    const state = store.normalizeTaskState(task, null, null, null, events);
    expect(state.status).toBe("completed");
    expect(state.isRunning).toBe(false);
  });

  it("replays step lifecycle (started, completed, failed, retried)", () => {
    const task: AgentTask = {
      task_id: "task_steps",
      user_request: "Run steps",
      created_at: 1000,
      updated_at: 1000,
      status: "executing",
      priority: 1,
    };

    const plan: AgentPlan = {
      plan_id: "plan_steps",
      task_id: "task_steps",
      goal: "Step replay test",
      steps: [
        {
          step_id: "s1",
          objective: "Step 1",
          dependencies: [],
          status: "pending",
          attempt_count: 0,
        },
        {
          step_id: "s2",
          objective: "Step 2",
          dependencies: ["s1"],
          status: "pending",
          attempt_count: 0,
        },
      ],
    };

    const events: AgentEvent[] = [
      {
        event_id: "e1",
        event_type: "step_started",
        task_id: "task_steps",
        step_id: "s1",
        timestamp: 1002,
        source: "orchestrator",
        payload: {},
      },
      {
        event_id: "e2",
        event_type: "step_completed",
        task_id: "task_steps",
        step_id: "s1",
        timestamp: 1005,
        source: "orchestrator",
        payload: { output: { data: "success" } },
      },
      {
        event_id: "e3",
        event_type: "step_started",
        task_id: "task_steps",
        step_id: "s2",
        timestamp: 1006,
        source: "orchestrator",
        payload: {},
      },
      {
        event_id: "e4",
        event_type: "step_retried",
        task_id: "task_steps",
        step_id: "s2",
        timestamp: 1008,
        source: "orchestrator",
        payload: { attempt: 2 },
      },
    ];

    const state = store.normalizeTaskState(task, plan, null, null, events);
    expect(state.steps![0].status).toBe("completed");
    expect(state.steps![0].output).toEqual({ data: "success" });
    expect(state.steps![1].status).toBe("executing");
    expect(state.steps![1].attempt_count).toBe(2);
  });

  it("handles confirmation required and resolved events", () => {
    const task: AgentTask = {
      task_id: "task_conf",
      user_request: "Kill process",
      created_at: 1000,
      updated_at: 1000,
      status: "executing",
      priority: 1,
    };

    const reqEvent: AgentEvent = {
      event_id: "conf_evt_1",
      event_type: "confirmation_required",
      task_id: "task_conf",
      step_id: "s1",
      timestamp: 1005,
      source: "security_gate",
      payload: {
        confirmation_id: "conf_123",
        action: "KillProcess",
        reason: "Terminating system process PID 9999",
        risk_level: "high",
      },
    };

    const state1 = store.normalizeTaskState(task, null, null, null, [reqEvent]);
    expect(state1.status).toBe("waiting_confirmation");
    expect(state1.pendingConfirmation).not.toBeNull();
    expect(state1.pendingConfirmation?.confirmation_id).toBe("conf_123");
    expect(state1.pendingConfirmation?.risk_level).toBe("high");

    const resEvent: AgentEvent = {
      event_id: "conf_evt_2",
      event_type: "confirmation_resolved",
      task_id: "task_conf",
      timestamp: 1010,
      source: "security_gate",
      payload: { confirmation_id: "conf_123", confirmed: true },
    };

    const state2 = store.normalizeTaskState(task, null, null, null, [reqEvent, resEvent]);
    expect(state2.pendingConfirmation).toBeNull();
  });

  it("extracts evidence and artifacts for SIH 5-step canonical sequence", () => {
    const task: AgentTask = {
      task_id: "task_sih",
      user_request: "Investigate confidential incident and generate report",
      created_at: 1000,
      updated_at: 1000,
      status: "executing",
      priority: 1,
    };

    const plan: AgentPlan = {
      plan_id: "plan_sih",
      task_id: "task_sih",
      goal: "SIH Incident Investigation",
      steps: [
        { step_id: "step_know", objective: "Retrieve incident notes", dependencies: [], status: "pending", attempt_count: 0 },
        { step_id: "step_ai1", objective: "Analyze notes", dependencies: ["step_know"], status: "pending", attempt_count: 0 },
        { step_id: "step_net", objective: "Inspect active ports", dependencies: ["step_ai1"], status: "pending", attempt_count: 0 },
        { step_id: "step_ai2", objective: "Correlate telemetry", dependencies: ["step_net"], status: "pending", attempt_count: 0 },
        { step_id: "step_art", objective: "Generate incident report", dependencies: ["step_ai2"], status: "pending", attempt_count: 0 },
      ],
    };

    const events: AgentEvent[] = [
      {
        event_id: "e1",
        event_type: "knowledge_completed",
        task_id: "task_sih",
        step_id: "step_know",
        timestamp: 1001,
        source: "orchestrator",
        payload: { query: "breach indicators", document_count: 3 },
      },
      {
        event_id: "e2",
        event_type: "model_completed",
        task_id: "task_sih",
        step_id: "step_ai1",
        timestamp: 1003,
        source: "orchestrator",
        payload: { model_id: "qwen2.5-7b-local", role: "Initial Analysis" },
      },
      {
        event_id: "e3",
        event_type: "tool_completed",
        task_id: "task_sih",
        step_id: "step_net",
        timestamp: 1005,
        source: "orchestrator",
        payload: { tool_name: "rust:Network.ListConnections", ports: [80, 443, 9002] },
      },
      {
        event_id: "e4",
        event_type: "model_completed",
        task_id: "task_sih",
        step_id: "step_ai2",
        timestamp: 1007,
        source: "orchestrator",
        payload: { model_id: "qwen2.5-7b-local", role: "Telemetry Correlation" },
      },
      {
        event_id: "e5",
        event_type: "artifact_completed",
        task_id: "task_sih",
        step_id: "step_art",
        timestamp: 1009,
        source: "orchestrator",
        payload: {
          filename: "incident_report_2026.md",
          format: "markdown",
          size_bytes: 4096,
          hash: "sha256-a1b2c3d4",
          validation_status: "valid",
        },
      },
      {
        event_id: "e6",
        event_type: "task_completed",
        task_id: "task_sih",
        timestamp: 1010,
        source: "orchestrator",
        payload: {},
      },
    ];

    const state = store.normalizeTaskState(task, plan, null, null, events);
    expect(state.status).toBe("completed");
    expect(state.evidence).toHaveLength(4);
    expect(state.evidence![0].type).toBe("knowledge");
    expect(state.evidence![1].type).toBe("model");
    expect(state.evidence![2].type).toBe("network");
    expect(state.evidence![3].type).toBe("model");

    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts![0].name).toBe("incident_report_2026.md");
    expect(state.artifacts![0].validation_status).toBe("valid");
    expect(state.artifacts![0].is_local).toBe(true);
  });
});
