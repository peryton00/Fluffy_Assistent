import { apiClient, type RequestOptions } from "./client";
import type { TelemetrySnapshot, DiskTelemetry } from "../../types/contracts";

export async function fetchStatus(options?: RequestOptions): Promise<TelemetrySnapshot> {
  return apiClient.get<TelemetrySnapshot>("/status", options);
}

/**
 * Fetches connected storage devices, mount points, and capacities via native Tauri invoke.
 * Gracefully falls back to empty list in non-desktop or test environments.
 */
export async function fetchSystemDisks(): Promise<DiskTelemetry[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const disks = await invoke<DiskTelemetry[]>("get_system_disks");
    if (Array.isArray(disks)) {
      return disks;
    }
  } catch {
    // Graceful fallback for non-Tauri / test environments
  }
  return [];
}
