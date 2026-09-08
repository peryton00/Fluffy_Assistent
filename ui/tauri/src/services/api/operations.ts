/**
 * Fluffy Desktop - Operations API Service
 * 
 * Provides typed wrappers for backend operations endpoints:
 * - GET  /logs        -> Execution logs stream
 * - POST /normalize   -> System normalization / cleanup
 * - POST /net-speed   -> Network latency and speed benchmark
 * - POST /command     -> Pending action confirmation / cancellation
 * - POST /ui_connected / /ui_disconnected -> Session lifecycle
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  ExecutionLog,
  NormalizeResult,
  SpeedTestResult,
  ConfirmCommandPayload,
  CancelCommandPayload,
} from "../../types/contracts";

/**
 * Retrieves latest system execution logs from Python Brain.
 */
export async function fetchLogs(options?: RequestOptions): Promise<ExecutionLog[]> {
  return apiClient.get<ExecutionLog[]>("/logs", options);
}

/**
 * Triggers system normalization routine via backend IPC.
 */
export async function normalizeSystem(options?: RequestOptions): Promise<NormalizeResult> {
  return apiClient.post<NormalizeResult>("/normalize", undefined, options);
}

/**
 * Runs network latency and download speed test.
 */
export async function runSpeedTest(options?: RequestOptions): Promise<SpeedTestResult> {
  return apiClient.post<SpeedTestResult>("/net-speed", undefined, options);
}

/**
 * Confirms an authorized pending high-risk command.
 */
export async function confirmPendingAction(
  commandId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  const payload: ConfirmCommandPayload = {
    Confirm: {
      command_id: commandId,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}

/**
 * Rejects and cancels a pending high-risk command.
 */
export async function cancelPendingAction(
  commandId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  const payload: CancelCommandPayload = {
    Cancel: {
      command_id: commandId,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}
