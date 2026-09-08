/**
 * Fluffy Desktop - FTP API Service
 * 
 * Typed API client bindings for Python Brain FTP Server subsystem (HTTP 5123 /ftp/*).
 * Matches brain/routes/ftp_routes.py contract.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  FtpStatusResponse,
  FtpStartPayload,
  FtpStartResponse,
  FtpStopResponse,
  FtpLogsResponse,
  FtpLogEntry,
  FtpDisconnectPayload,
} from "../../types/contracts";

/**
 * Get current FTP server status, credentials, and connected clients.
 */
export async function fetchFtpStatus(
  options?: RequestOptions
): Promise<FtpStatusResponse> {
  return apiClient.get<FtpStatusResponse>("/ftp/status", options);
}

/**
 * Start the local FTP server instance.
 */
export async function startFtpServer(
  sharedDir?: string,
  options?: RequestOptions
): Promise<FtpStartResponse> {
  const payload: FtpStartPayload = sharedDir ? { shared_dir: sharedDir } : {};
  return apiClient.post<FtpStartResponse>("/ftp/start", payload, options);
}

/**
 * Stop the running FTP server.
 */
export async function stopFtpServer(
  options?: RequestOptions
): Promise<FtpStopResponse> {
  return apiClient.post<FtpStopResponse>("/ftp/stop", undefined, options);
}

/**
 * Fetch FTP activity logs.
 */
export async function fetchFtpLogs(
  options?: RequestOptions
): Promise<FtpLogEntry[]> {
  const res = await apiClient.get<FtpLogsResponse>("/ftp/logs", options);
  return res.logs || [];
}

/**
 * Clear FTP server event logs.
 */
export async function clearFtpLogs(
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>("/ftp/clear_logs", undefined, options);
}

/**
 * Disconnect a specific client by IP address.
 */
export async function disconnectFtpClient(
  clientIp: string,
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  const payload: FtpDisconnectPayload = { client_ip: clientIp };
  return apiClient.post<{ ok: boolean; message?: string }>("/ftp/disconnect", payload, options);
}

/**
 * Fetch QR code data for mobile FTP access.
 */
export async function fetchFtpQrCode(
  options?: RequestOptions
): Promise<{ ok: boolean; qr_code?: string; error?: string }> {
  return apiClient.get<{ ok: boolean; qr_code?: string; error?: string }>("/ftp/qr", options);
}
