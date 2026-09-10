/**
 * Fluffy Desktop - Network Intelligence API Service (N9.2 / N9.4)
 * 
 * Provides typed wrappers for N9 Network Intelligence endpoints:
 * - GET /local_network/intelligence/summary (Network environment, tallies, insights, freshness)
 * - GET /local_network/intelligence/devices (Classified subnet devices with evidence)
 * - GET /local_network/intelligence/services (Managed local listening service catalog)
 * - GET /local_network/intelligence/changes (Bounded chronological network transitions)
 * 
 * Strict Security Invariants:
 * - Read-only observational endpoints.
 * - Zero secrets, credentials, or packet payloads.
 * - Authority invariant: N6 Guardian remains sole authority for security alerts/verdicts.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  NetworkIntelligenceSummary,
  ClassifiedNetworkDevice,
  ManagedLocalService,
  NetworkChangeEvent,
} from "../../types/contracts";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  summary?: T;
  devices?: T;
  services?: T;
  changes?: T;
  error?: string;
}

/**
 * Fetches high-level semantic summary of the current network environment.
 */
export async function fetchNetworkIntelligenceSummary(
  options?: RequestOptions
): Promise<NetworkIntelligenceSummary | null> {
  const res = await apiClient.get<ApiResponse<NetworkIntelligenceSummary>>(
    "/local_network/intelligence/summary",
    options
  );
  return res?.summary ?? null;
}

/**
 * Fetches classified subnet devices with evidence, role, and presence state.
 */
export async function fetchNetworkIntelligenceDevices(
  options?: RequestOptions
): Promise<ClassifiedNetworkDevice[]> {
  const res = await apiClient.get<ApiResponse<ClassifiedNetworkDevice[]>>(
    "/local_network/intelligence/devices",
    options
  );
  return res?.devices ?? [];
}

/**
 * Fetches managed catalog of local listening services and lifecycles.
 */
export async function fetchNetworkIntelligenceServices(
  options?: RequestOptions
): Promise<ManagedLocalService[]> {
  const res = await apiClient.get<ApiResponse<ManagedLocalService[]>>(
    "/local_network/intelligence/services",
    options
  );
  return res?.services ?? [];
}

/**
 * Fetches bounded chronological list of network intelligence events and transitions.
 */
export async function fetchNetworkIntelligenceChanges(
  limit = 100,
  options?: RequestOptions
): Promise<NetworkChangeEvent[]> {
  const res = await apiClient.get<ApiResponse<NetworkChangeEvent[]>>(
    `/local_network/intelligence/changes?limit=${limit}`,
    options
  );
  return res?.changes ?? [];
}
