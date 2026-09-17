/**
 * Fluffy Desktop - Canonical Agent Execution API Service
 * Phase 11: Agent Execution Workspace UI
 * 
 * Provides typed HTTP communication with the backend Agent Web API routes,
 * strictly delegating execution and state retrieval to the canonical backend.
 */

import { apiClient } from "./client";
import type {
  AgentTask,
  AgentTasksListResponse,
  AgentTaskDetailsResponse,
  AgentEventsResponse,
  AgentEvent,
} from "../../types/agent";

export async function fetchAgentTasks(status?: string): Promise<AgentTask[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const resp = await apiClient.get<AgentTasksListResponse>(`/agent/tasks${query}`);
  return resp.tasks || [];
}

export async function fetchAgentTaskDetails(taskId: string): Promise<AgentTaskDetailsResponse> {
  return apiClient.get<AgentTaskDetailsResponse>(`/agent/tasks/${encodeURIComponent(taskId)}`);
}

export async function fetchAgentTaskEvents(taskId: string): Promise<AgentEvent[]> {
  const resp = await apiClient.get<AgentEventsResponse>(`/agent/tasks/${encodeURIComponent(taskId)}/events`);
  return resp.events || [];
}

export interface CreateTaskPayload {
  task: string;
  goal?: string;
  task_id?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  auto_start?: boolean;
}

export async function createAgentTask(payload: CreateTaskPayload): Promise<AgentTask> {
  const resp = await apiClient.post<{ ok: boolean; task: AgentTask }>("/agent/tasks", payload);
  return resp.task;
}

export async function startAgentTask(taskId: string, sync = false): Promise<void> {
  await apiClient.post<{ ok: boolean }>(`/agent/tasks/${encodeURIComponent(taskId)}/start`, { sync });
}

export async function resumeAgentTask(
  taskId: string,
  confirmed: boolean,
  confirmationId?: string,
  sync = false
): Promise<void> {
  await apiClient.post<{ ok: boolean }>(`/agent/tasks/${encodeURIComponent(taskId)}/resume`, {
    confirmed,
    confirmation_id: confirmationId,
    sync,
  });
}

export async function cancelAgentTask(taskId: string): Promise<boolean> {
  const resp = await apiClient.post<{ ok: boolean; cancelled: boolean }>(
    `/agent/tasks/${encodeURIComponent(taskId)}/cancel`
  );
  return resp.cancelled;
}
