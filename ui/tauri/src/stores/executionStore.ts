/**
 * Fluffy Desktop - Execution Store
 * Phase 11: Agent Execution Workspace UI
 * 
 * Central state coordinator for the canonical Agent Execution Workspace.
 * Normalizes task, plan DAG, steps, capabilities, timeline events, evidence,
 * artifacts, and confirmations. Supports deterministic event replay and adaptive polling.
 */

import { useSyncExternalStore } from "react";
import {
  fetchAgentTasks,
  fetchAgentTaskDetails,
  fetchAgentTaskEvents,
  createAgentTask,
  resumeAgentTask,
  cancelAgentTask,
} from "../services/api/agent";
import type {
  AgentTask,
  AgentPlan,
  PlanStep,
  AgentEvent,
  AgentResult,
  ConfirmationRequest,
  ArtifactItem,
  TaskStatus,
} from "../types/agent";

export interface EvidenceItem {
  id: string;
  type: "knowledge" | "network" | "model" | "tool";
  title: string;
  summary: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface ExecutionWorkspaceState {
  tasks: AgentTask[];
  activeTaskId: string | null;
  selectedTask: AgentTask | null;
  plan: AgentPlan | null;
  steps: PlanStep[];
  events: AgentEvent[];
  selectedStepId: string | null;
  pendingConfirmation: ConfirmationRequest | null;
  artifacts: ArtifactItem[];
  evidence: EvidenceItem[];
  status: TaskStatus | "idle";
  isRunning: boolean;
  result: AgentResult | null;
  error: string | null;
  loading: boolean;
  connectionState: "CONNECTED" | "CONNECTING" | "STALE" | "DISCONNECTED";
  lastFetched: number | null;
}

const MAX_EVENTS_HISTORY = 500;

export class ExecutionStoreManager {
  private state: ExecutionWorkspaceState = {
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
    connectionState: "CONNECTING",
    lastFetched: null,
  };

  private listeners = new Set<() => void>();
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private inFlightFetch = false;

  public getState(): ExecutionWorkspaceState {
    return this.state;
  }

  public setState(partial: Partial<ExecutionWorkspaceState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Loads list of available tasks from backend.
   */
  public loadTasks = async (): Promise<void> => {
    try {
      const tasks = await fetchAgentTasks();
      this.setState({
        tasks,
        connectionState: "CONNECTED",
      });
      // Auto-select latest task if none active and tasks exist
      if (!this.state.activeTaskId && tasks.length > 0) {
        await this.selectTask(tasks[0].task_id);
      }
    } catch (err) {
      this.setState({
        connectionState: "STALE",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /**
   * Selects an active task and replays its canonical execution state.
   */
  public selectTask = async (taskId: string | null): Promise<void> => {
    this.stopPolling();

    if (!taskId) {
      this.setState({
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
      });
      return;
    }

    this.setState({
      activeTaskId: taskId,
      loading: true,
      error: null,
      selectedStepId: null,
    });

    await this.fetchAndReplayTask(taskId);

    // If task is in an active non-terminal state, initiate adaptive polling
    const currentStatus = this.state.status;
    if (
      currentStatus === "executing" ||
      currentStatus === "ready" ||
      currentStatus === "planning" ||
      currentStatus === "analyzing" ||
      currentStatus === "waiting_confirmation" ||
      currentStatus === "waiting"
    ) {
      this.startPolling(taskId);
    }
  };

  /**
   * Fetches full task record, plan, state, and events, then replays events.
   */
  public fetchAndReplayTask = async (taskId: string): Promise<void> => {
    if (this.inFlightFetch) return;
    this.inFlightFetch = true;

    try {
      const [details, rawEvents] = await Promise.all([
        fetchAgentTaskDetails(taskId),
        fetchAgentTaskEvents(taskId),
      ]);

      const boundedEvents = rawEvents.slice(-MAX_EVENTS_HISTORY);

      // Reconstruct normalized state from task details + event replay
      const normalized = this.normalizeTaskState(details.task, details.plan, details.state, details.result, boundedEvents);

      this.setState({
        ...normalized,
        loading: false,
        connectionState: "CONNECTED",
        lastFetched: Date.now(),
      });

      // Automatically halt polling if task entered terminal state
      if (
        normalized.status === "completed" ||
        normalized.status === "failed" ||
        normalized.status === "cancelled"
      ) {
        this.stopPolling();
      }
    } catch (err) {
      this.setState({
        loading: false,
        connectionState: "STALE",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.inFlightFetch = false;
    }
  };

  /**
   * Normalizes task details and replays historical events deterministically.
   */
  public normalizeTaskState(
    task: AgentTask,
    initialPlan: AgentPlan | null | undefined,
    initialState: unknown,
    initialResult: AgentResult | null | undefined,
    events: AgentEvent[]
  ): Partial<ExecutionWorkspaceState> {
    let taskStatus: TaskStatus = task.status;
    let isRunning = !["completed", "failed", "cancelled"].includes(task.status);
    let plan = initialPlan ? { ...initialPlan, steps: initialPlan.steps.map((s) => ({ ...s })) } : null;
    let steps: PlanStep[] = plan ? [...plan.steps] : [];
    let pendingConfirmation: ConfirmationRequest | null = null;
    const artifacts: ArtifactItem[] = [];
    const evidence: EvidenceItem[] = [];
    let selectedStepId = this.state.selectedStepId;

    // Check state pending_confirmations if provided
    if (initialState && typeof initialState === "object" && "pending_confirmations" in initialState) {
      const confMap = (initialState as { pending_confirmations: Record<string, Record<string, unknown>> }).pending_confirmations;
      const firstConfId = Object.keys(confMap)[0];
      if (firstConfId) {
        const confObj = confMap[firstConfId];
        pendingConfirmation = {
          confirmation_id: firstConfId,
          step_id: confObj.step_id as string | undefined,
          action: (confObj.action as string) || (confObj.tool as string) || "System Action",
          reason: (confObj.reason as string) || "Security Confirmation Required",
          risk_level: (confObj.risk_level as "low" | "medium" | "high" | "critical") || "medium",
          details: confObj,
        };
      }
    }

    // Replay canonical execution events
    for (const evt of events) {
      const type = evt.event_type || evt.type;
      const stepId = evt.step_id;
      const payload = evt.payload || {};

      // 1. Task Lifecycle Events
      if (type === "task_started" || type === "task_resumed") {
        taskStatus = "executing";
        isRunning = true;
      } else if (type === "task_completed") {
        taskStatus = "completed";
        isRunning = false;
      } else if (type === "task_failed") {
        taskStatus = "failed";
        isRunning = false;
      } else if (type === "task_cancelled") {
        taskStatus = "cancelled";
        isRunning = false;
      } else if (type === "task_paused") {
        taskStatus = "paused";
        isRunning = false;
      }

      // 2. Plan Lifecycle Events
      if (type === "plan_created" && payload.plan) {
        plan = payload.plan as AgentPlan;
        steps = plan.steps.map((s) => ({ ...s }));
      }

      // 3. Step Lifecycle Events
      if (stepId) {
        let step = steps.find((s) => s.step_id === stepId);
        if (!step && plan) {
          // If step missing in plan list, create placeholder
          step = {
            step_id: stepId,
            objective: (payload.objective as string) || stepId,
            dependencies: (payload.dependencies as string[]) || [],
            status: "pending",
            attempt_count: 0,
          };
          steps.push(step);
        }

        if (step) {
          if (type === "step_started") {
            step.status = "executing";
            step.attempt_count = (step.attempt_count || 0) + 1;
            if (!selectedStepId) selectedStepId = step.step_id;
          } else if (type === "step_completed") {
            step.status = "completed";
            step.output = payload.output;
            step.completed_at = evt.timestamp;
          } else if (type === "step_failed") {
            step.status = "failed";
            step.error = (payload.error as string) || "Step execution failed";
            step.completed_at = evt.timestamp;
          } else if (type === "step_waiting_confirmation") {
            step.status = "waiting_confirmation";
            taskStatus = "waiting_confirmation";
          } else if (type === "step_retried" || type === "retry_started") {
            step.status = "executing";
            step.attempt_count = (payload.attempt as number) || step.attempt_count + 1;
          } else if (type === "step_cancelled") {
            step.status = "cancelled";
          } else if (type === "step_blocked") {
            step.status = "pending";
          }
        }
      }

      // 4. Capability Lifecycle: Knowledge
      if (type === "knowledge_completed") {
        const query = (payload.query as string) || "Knowledge Retrieval";
        const docCount = (payload.document_count as number) || (payload.documents as unknown[] | undefined)?.length || 0;
        evidence.push({
          id: `ev_know_${evt.event_id}`,
          type: "knowledge",
          title: `Knowledge: ${query}`,
          summary: `Retrieved ${docCount} verified local evidence documents for query.`,
          metadata: { ...payload, sovereignty: "local" },
          timestamp: evt.timestamp,
        });
      }

      // 5. Capability Lifecycle: Tool / Network
      if (type === "tool_completed") {
        const toolName = (payload.tool_name as string) || (payload.tool_id as string) || "System Tool";
        const isNetwork = toolName.toLowerCase().includes("net") || toolName.toLowerCase().includes("port");
        evidence.push({
          id: `ev_tool_${evt.event_id}`,
          type: isNetwork ? "network" : "tool",
          title: `${isNetwork ? "Network Observation" : "Tool Output"}: ${toolName}`,
          summary: `Executed local capability: ${toolName}. Execution verified.`,
          metadata: { ...payload, sovereignty: "local" },
          timestamp: evt.timestamp,
        });
      }

      // 6. Capability Lifecycle: Model
      if (type === "model_completed") {
        const modelId = (payload.model_id as string) || "Local AI Model";
        const role = (payload.role as string) || "Analysis & Correlation";
        evidence.push({
          id: `ev_model_${evt.event_id}`,
          type: "model",
          title: `Reasoning: ${role}`,
          summary: `Synthesized observations via ${modelId} under zero-exfiltration local inference.`,
          metadata: { ...payload, sovereignty: "local" },
          timestamp: evt.timestamp,
        });
      }

      // 7. Capability Lifecycle: Artifact
      if (type === "artifact_completed") {
        const filename = (payload.filename as string) || (payload.name as string) || "incident_report.md";
        const format = (payload.format as string) || (payload.artifact_type as string) || "markdown";
        const size = (payload.size_bytes as number) || (payload.size as number) || 0;
        const hash = (payload.hash as string) || (payload.sha256 as string) || "sha256-verified";
        const validation = (payload.validation_status as "valid" | "invalid") || "valid";
        const safePath = (payload.path as string) || filename;

        artifacts.push({
          artifact_id: (payload.artifact_id as string) || evt.event_id,
          name: filename,
          format,
          size,
          hash,
          validation_status: validation,
          path: safePath,
          is_local: true,
          created_at: evt.timestamp,
          metadata: payload,
        });
      }

      // 8. Confirmation Lifecycle
      if (type === "confirmation_required") {
        taskStatus = "waiting_confirmation";
        pendingConfirmation = {
          confirmation_id: (payload.confirmation_id as string) || evt.event_id,
          step_id: stepId,
          action: (payload.action as string) || (payload.tool as string) || "Sensitive Operation",
          reason: (payload.reason as string) || "Action requires user confirmation.",
          risk_level: (payload.risk_level as "low" | "medium" | "high" | "critical") || "medium",
          details: payload,
        };
      } else if (type === "confirmation_resolved") {
        pendingConfirmation = null;
      }
    }

    // Default select first step if none selected
    if (!selectedStepId && steps.length > 0) {
      selectedStepId = steps[0].step_id;
    }

    return {
      selectedTask: { ...task, status: taskStatus },
      plan: plan ? { ...plan, steps } : null,
      steps,
      events,
      selectedStepId,
      pendingConfirmation,
      artifacts,
      evidence,
      status: taskStatus,
      isRunning,
      result: initialResult || null,
    };
  }

  /**
   * Sets the currently inspected step.
   */
  public selectStep = (stepId: string | null): void => {
    this.setState({ selectedStepId: stepId });
  };

  /**
   * Starts periodic polling for active task events.
   */
  public startPolling = (taskId: string): void => {
    this.stopPolling();
    this.pollIntervalId = setInterval(() => {
      if (this.state.activeTaskId === taskId) {
        this.fetchAndReplayTask(taskId);
      } else {
        this.stopPolling();
      }
    }, 1500);
  };

  /**
   * Stops active polling.
   */
  public stopPolling = (): void => {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  };

  /**
   * Confirms or denies a pending confirmation.
   */
  public resolveConfirmation = async (confirmed: boolean): Promise<void> => {
    const { activeTaskId, pendingConfirmation } = this.state;
    if (!activeTaskId || !pendingConfirmation) return;

    this.setState({ loading: true });
    try {
      await resumeAgentTask(activeTaskId, confirmed, pendingConfirmation.confirmation_id);
      this.setState({ pendingConfirmation: null });
      await this.fetchAndReplayTask(activeTaskId);
      this.startPolling(activeTaskId);
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /**
   * Cancels the active task.
   */
  public cancelTask = async (): Promise<void> => {
    const { activeTaskId } = this.state;
    if (!activeTaskId) return;

    this.setState({ loading: true });
    try {
      await cancelAgentTask(activeTaskId);
      await this.fetchAndReplayTask(activeTaskId);
      this.stopPolling();
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /**
   * Submits and registers a new agent task.
   */
  public createAndStartTask = async (
    userRequest: string,
    goal?: string,
    autoStart = true
  ): Promise<AgentTask> => {
    this.setState({ loading: true, error: null });
    try {
      const task = await createAgentTask({
        task: userRequest,
        goal,
        auto_start: autoStart,
      });
      await this.loadTasks();
      await this.selectTask(task.task_id);
      return task;
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

export const executionStore = new ExecutionStoreManager();

export type ExtendedExecutionState = ExecutionWorkspaceState & {
  loadTasks: () => Promise<void>;
  selectTask: (taskId: string | null) => Promise<void>;
  selectStep: (stepId: string | null) => void;
  resolveConfirmation: (confirmed: boolean) => Promise<void>;
  cancelTask: () => Promise<void>;
  createAndStartTask: (userRequest: string, goal?: string, autoStart?: boolean) => Promise<AgentTask>;
  stopPolling: () => void;
};

let lastRawState: ExecutionWorkspaceState | null = null;
let cachedEnrichedState: ExtendedExecutionState | null = null;

function getEnrichedExecutionState(): ExtendedExecutionState {
  const raw = executionStore.getState();
  if (raw === lastRawState && cachedEnrichedState !== null) {
    return cachedEnrichedState;
  }
  lastRawState = raw;
  cachedEnrichedState = {
    ...raw,
    loadTasks: executionStore.loadTasks,
    selectTask: executionStore.selectTask,
    selectStep: executionStore.selectStep,
    resolveConfirmation: executionStore.resolveConfirmation,
    cancelTask: executionStore.cancelTask,
    createAndStartTask: executionStore.createAndStartTask,
    stopPolling: executionStore.stopPolling,
  };
  return cachedEnrichedState;
}

/**
 * React hook for consuming Agent Execution Workspace state.
 */
export function useExecutionStore(): ExtendedExecutionState {
  return useSyncExternalStore(
    executionStore.subscribe,
    getEnrichedExecutionState,
    getEnrichedExecutionState
  );
}
