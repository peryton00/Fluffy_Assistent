/**
 * Fluffy Desktop - Local Network Observability API Service
 * 
 * Provides typed wrappers for host local network observability endpoints:
 * - GET /local_network/interfaces (Network.GetInterfaces)
 * - GET /local_network/devices (Network.GetLocalDevices)
 * - GET /local_network/flows (Network.GetActiveFlows)
 * - GET /local_network/wifi (Network.ListWifiProfiles)
 * - GET /local_network/snapshot (Aggregated snapshot)
 * 
 * Strict Rule:
 * Distinct from Cluster P2P networking (/network/*).
 * Zero credentials or secrets are ever requested, parsed, or returned.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  LocalNetworkInterface,
  LocalNetworkDevice,
  LocalNetworkFlow,
  LocalWifiProfile,
  LocalNetworkSnapshot,
} from "../../types/contracts";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  snapshot?: T;
  error?: unknown;
}

/**
 * Fetches host network interfaces with physical classification and traffic rates.
 */
export async function fetchLocalInterfaces(
  includeRates = true,
  options?: RequestOptions
): Promise<LocalNetworkInterface[]> {
  const query = includeRates ? "?include_rates=true" : "?include_rates=false";
  const res = await apiClient.get<ApiResponse<{ count: number; interfaces: LocalNetworkInterface[] }>>(
    `/local_network/interfaces${query}`,
    options
  );
  return res?.data?.interfaces ?? [];
}

/**
 * Fetches passive local subnet neighbor devices discovered via OS ARP cache.
 */
export async function fetchLocalDevices(options?: RequestOptions): Promise<LocalNetworkDevice[]> {
  const res = await apiClient.get<ApiResponse<{ count: number; devices: LocalNetworkDevice[] }>>(
    "/local_network/devices",
    options
  );
  return res?.data?.devices ?? [];
}

/**
 * Fetches active TCP and UDP socket flows mapped to local OS processes.
 */
export async function fetchLocalFlows(options?: RequestOptions): Promise<LocalNetworkFlow[]> {
  const res = await apiClient.get<ApiResponse<{ count: number; flows: LocalNetworkFlow[] }>>(
    "/local_network/flows",
    options
  );
  return res?.data?.flows ?? [];
}

/**
 * Fetches known local Wi-Fi profiles and non-secret security posture metadata.
 */
export async function fetchLocalWifiProfiles(options?: RequestOptions): Promise<LocalWifiProfile[]> {
  const res = await apiClient.get<ApiResponse<{ count: number; profiles: LocalWifiProfile[] }>>(
    "/local_network/wifi",
    options
  );
  return res?.data?.profiles ?? [];
}

/**
 * Fetches an aggregated host network observation snapshot.
 */
export async function fetchLocalNetworkSnapshot(options?: RequestOptions): Promise<LocalNetworkSnapshot> {
  const res = await apiClient.get<ApiResponse<LocalNetworkSnapshot>>(
    "/local_network/snapshot",
    options
  );
  return (
    res?.snapshot ?? {
      timestamp: Date.now() / 1000,
      interfaces: [],
      devices: [],
      active_flows: [],
      wifi_profiles: [],
      errors: {},
      success: false,
    }
  );
}

/**
 * Fetches aggregated network flow & traffic summary (N7).
 */
export async function fetchLocalTrafficSummary(options?: RequestOptions): Promise<import("../../types/contracts").AggregatedTrafficSummary | null> {
  const res = await apiClient.get<{ ok: boolean; summary?: import("../../types/contracts").AggregatedTrafficSummary }>(
    "/local_network/traffic_summary",
    options
  );
  return res?.summary ?? null;
}

/**
 * Fetches bucketed time-series traffic history (N7).
 */
export async function fetchLocalTrafficHistory(
  window: "1h" | "24h" = "1h",
  options?: RequestOptions
): Promise<import("../../types/contracts").TrafficTimeBucket[]> {
  const res = await apiClient.get<{ ok: boolean; window: string; history?: import("../../types/contracts").TrafficTimeBucket[] }>(
    `/local_network/traffic_history?window=${window}`,
    options
  );
  return res?.history ?? [];
}

/**
 * Starts a controlled, bounded, metadata-only packet monitoring session (N8 / SIH26117).
 */
export async function startPacketCapture(
  params?: { interface_name?: string; duration_seconds?: number; max_packets?: number },
  options?: RequestOptions
): Promise<import("../../types/contracts").PacketCaptureStatus | null> {
  const res = await apiClient.post<{ ok: boolean; data?: { status: import("../../types/contracts").PacketCaptureStatus } }>(
    "/local_network/capture/start",
    params ?? {},
    options
  );
  return res?.data?.status ?? null;
}

/**
 * Stops an active packet monitoring session.
 */
export async function stopPacketCapture(
  options?: RequestOptions
): Promise<import("../../types/contracts").PacketCaptureStatus | null> {
  const res = await apiClient.post<{ ok: boolean; data?: { status: import("../../types/contracts").PacketCaptureStatus } }>(
    "/local_network/capture/stop",
    {},
    options
  );
  return res?.data?.status ?? null;
}

/**
 * Fetches the status and recent bounded packet metadata observations.
 */
export async function getPacketCaptureStatus(
  options?: RequestOptions
): Promise<import("../../types/contracts").PacketCaptureStatus | null> {
  const res = await apiClient.get<{ ok: boolean; data?: { status: import("../../types/contracts").PacketCaptureStatus } }>(
    "/local_network/capture/status",
    options
  );
  return res?.data?.status ?? null;
}


