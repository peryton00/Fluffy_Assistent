/**
 * Fluffy Desktop - Status API Service
 * 
 * Provides typed access to the backend system status & telemetry endpoint: GET /status
 */

import { apiClient, type RequestOptions } from "./client";
import type { TelemetrySnapshot } from "../../types/contracts";

export async function fetchStatus(options?: RequestOptions): Promise<TelemetrySnapshot> {
  return apiClient.get<TelemetrySnapshot>("/status", options);
}
