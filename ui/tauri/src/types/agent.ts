/**
 * Fluffy Desktop - Canonical Agent Execution Types & Contracts
 * Phase 11: Agent Execution Workspace UI
 * 
 * Strongly-typed models matching canonical Phase 1-10 backend contracts.
 */

export type TaskStatus =
  | "created"
  | "analyzing"
  | "planning"
  | "ready"
  | "executing"
  | "waiting_confirmation"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus =
  | "pending"
  | "ready"
  | "executing"
  | "waiting_confirmation"
  | "waiting"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type ExecutionType =
  | "tool"
  | "model"
  | "knowledge"
  | "artifact"
  | "data";

export type AgentEventType =
  // Task Lifecycle
  | "task_created"
  | "task_started"
  | "task_planning_started"
  | "task_paused"
  | "task_resumed"
  | "task_completed"
  | "task_failed"
  | "task_cancelled"
  // Plan Lifecycle
  | "plan_created"
  | "plan_validated"
  | "plan_started"
  | "plan_completed"
  // Step Lifecycle
  | "step_ready"
  | "step_started"
  | "step_waiting_confirmation"
  | "step_completed"
  | "step_failed"
  | "step_blocked"
  | "step_retried"
  | "step_cancelled"
  // Capability Lifecycle: Tool
  | "tool_selected"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  // Capability Lifecycle: Model
  | "model_selected"
  | "model_started"
  | "model_completed"
  | "model_failed"
  // Capability Lifecycle: Knowledge
  | "knowledge_started"
  | "knowledge_completed"
  | "knowledge_failed"
  // Capability Lifecycle: Artifact
  | "artifact_started"
  | "artifact_completed"
  | "artifact_failed"
  // Confirmation Lifecycle
  | "confirmation_required"
  | "confirmation_resolved"
  // Recovery & Errors
  | "retry_started"
  | "recovery_started"
  | "recovery_completed"
  | "execution_error";

export interface PlanStep {
  step_id: string;
  objective: string;
  description?: string;
  dependencies: string[];
  status: StepStatus;
  execution_type?: ExecutionType;
  tool_requirement?: string;
  model_requirement?: Record<string, unknown>;
  knowledge_requirement?: Record<string, unknown>;
  artifact_requirement?: Record<string, unknown>;
  input_parameters?: Record<string, unknown>;
  output?: unknown;
  attempt_count: number;
  timeout?: number;
  created_at?: number;
  completed_at?: number;
  error?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentPlan {
  plan_id: string;
  task_id: string;
  goal: string;
  steps: PlanStep[];
  created_at?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTask {
  task_id: string;
  user_request: string;
  goal?: string;
  created_at: number;
  updated_at: number;
  status: TaskStatus;
  priority: number;
  constraints?: Record<string, unknown>;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlation_id?: string;
  error?: string;
}

export interface StepObservation {
  step_id: string;
  task_id: string;
  success: boolean;
  output?: unknown;
  error?: string;
  duration_ms: number;
  tool_used?: string;
  model_used?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentEvent {
  event_id: string;
  event_type: AgentEventType;
  type?: AgentEventType;
  task_id: string;
  step_id?: string;
  timestamp: number;
  status?: string;
  source: string;
  correlation_id?: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  task_id: string;
  status: TaskStatus;
  success: boolean;
  summary: string;
  observations?: Record<string, StepObservation | unknown>;
  duration_ms: number;
  waiting_confirmation?: boolean;
  confirmation_id?: string;
  confirmation_message?: string;
  error?: string;
}

export interface AgentStateData {
  task: AgentTask;
  plan?: AgentPlan;
  current_step_id?: string;
  completed_steps: string[];
  failed_steps: string[];
  observations: Record<string, StepObservation | unknown>;
  variables: Record<string, unknown>;
  artifacts: Array<Record<string, unknown>>;
  pending_confirmations: Record<string, Record<string, unknown>>;
  created_at: number;
  updated_at: number;
}

export interface AgentTaskDetailsResponse {
  ok: boolean;
  task: AgentTask;
  plan?: AgentPlan | null;
  state?: AgentStateData | null;
  result?: AgentResult | null;
  is_running?: boolean;
  error?: string;
}

export interface AgentTasksListResponse {
  ok: boolean;
  tasks: AgentTask[];
  error?: string;
}

export interface AgentEventsResponse {
  ok: boolean;
  task_id: string;
  events: AgentEvent[];
  error?: string;
}

export interface ConfirmationRequest {
  confirmation_id: string;
  step_id?: string;
  action: string;
  reason?: string;
  risk_level?: "low" | "medium" | "high" | "critical";
  details?: Record<string, unknown>;
}

export interface ArtifactItem {
  artifact_id?: string;
  name: string;
  format?: string;
  size?: number | string;
  validation_status?: "valid" | "invalid" | "pending" | "unknown";
  hash?: string;
  path?: string;
  content_preview?: string;
  is_local: boolean;
  created_at?: number;
  metadata?: Record<string, unknown>;
}
