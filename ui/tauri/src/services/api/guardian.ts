/**
 * Fluffy Desktop - Guardian API Service
 * 
 * Typed service client for Guardian security and authorization operations:
 * - Pending confirmation authorization & cancellation (POST /command)
 * - Process security actions (POST /security_action { pid, action: "trust" | "ignore" | "mark_dangerous" })
 * - Direct process behavior trusting (POST /trust_process { process })
 * - Trusted processes memory management (GET/POST/DELETE /memory/trusted_processes)
 * - Guardian baseline clearing and reset (POST /clear_guardian)
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  SecurityActionType,
  TrustedProcessesResponse,
} from "../../types/contracts";

/**
 * Authorizes a pending approval command.
 */
export async function confirmApproval(
  commandId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(
    "/command",
    { Confirm: { command_id: commandId } },
    options
  );
}

/**
 * Rejects/cancels a pending approval command.
 */
export async function cancelApproval(
  commandId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(
    "/command",
    { Cancel: { command_id: commandId } },
    options
  );
}

/**
 * Executes a Guardian security action on a running process PID.
 */
export async function executeSecurityAction(
  pid: number,
  action: SecurityActionType,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(
    "/security_action",
    { pid, action },
    options
  );
}

/**
 * Marks a process name as trusted, creating a baseline and persisting it.
 */
export async function trustProcessName(
  processName: string,
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>(
    "/trust_process",
    { process: processName },
    options
  );
}

/**
 * Fetches the persisted list of trusted processes from memory.
 */
export async function fetchTrustedProcesses(
  options?: RequestOptions
): Promise<string[]> {
  const res = await apiClient.get<TrustedProcessesResponse>(
    "/memory/trusted_processes",
    options
  );
  return Array.isArray(res?.trusted_processes) ? res.trusted_processes : [];
}

/**
 * Adds a process to the persistent trusted processes list.
 */
export async function addTrustedProcess(
  processName: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(
    "/memory/trusted_processes",
    { process_name: processName },
    options
  );
}

/**
 * Removes a process from the persistent trusted processes list.
 */
export async function removeTrustedProcess(
  processName: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>(
    "/memory/trusted_processes",
    { process_name: processName },
    options
  );
}

/**
 * Clears all Guardian recognition baselines and resets detector state.
 */
export async function clearGuardianRecognition(
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>(
    "/clear_guardian",
    undefined,
    options
  );
}
