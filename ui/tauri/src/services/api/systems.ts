/**
 * Fluffy Desktop - Systems Domain API Service
 * 
 * Provides typed wrappers for backend systems operations:
 * - Applications management (GET /apps, POST /apps/refresh, POST /apps/launch, POST /apps/uninstall)
 * - Process management (POST /command { KillProcess: { pid } })
 * - Startup persistence management (POST /command { StartupToggle, StartupAdd, StartupRemove })
 * - Network / LAN distributed nodes (GET /network/role, POST /network/role, GET /network/admin/machines, etc.)
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  InstalledApp,
  NetworkRole,
  NetworkMachine,
  RemoteMachineData,
  KillProcessPayload,
  StartupTogglePayload,
  StartupAddPayload,
  StartupRemovePayload,
} from "../../types/contracts";

// ============================================================================
// 1. Applications API
// ============================================================================

/**
 * Lists installed desktop applications discovered by the Python backend.
 */
export async function fetchApplications(options?: RequestOptions): Promise<InstalledApp[]> {
  return apiClient.get<InstalledApp[]>("/apps", options);
}

/**
 * Triggers a deep refresh and re-scan of system installed applications.
 */
export async function refreshApplications(options?: RequestOptions): Promise<{ ok: boolean; count: number }> {
  return apiClient.post<{ ok: boolean; count: number }>("/apps/refresh", undefined, options);
}

/**
 * Launches a desktop application by executable path.
 */
export async function launchApplication(
  payload: { exe_path?: string; location?: string; name?: string },
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/apps/launch", payload, options);
}

/**
 * Triggers uninstallation of an application via Windows MsiExec or uninstaller executable.
 */
export async function uninstallApplication(
  payload: { uninstall_string?: string; name?: string },
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/apps/uninstall", payload, options);
}

// ============================================================================
// 2. Process Control API
// ============================================================================

/**
 * Terminates a running OS process by PID via Core IPC.
 */
export async function killProcess(pid: number, options?: RequestOptions): Promise<{ ok: boolean }> {
  const payload: KillProcessPayload = {
    KillProcess: {
      pid,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}

// ============================================================================
// 3. Startup Persistence API
// ============================================================================

/**
 * Toggles a Windows Registry startup entry between enabled and disabled.
 */
export async function toggleStartupApp(
  name: string,
  enabled: boolean,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  const payload: StartupTogglePayload = {
    StartupToggle: {
      name,
      enabled,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}

/**
 * Adds an application path to Windows startup registry.
 */
export async function addStartupApp(
  name: string,
  path: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  const payload: StartupAddPayload = {
    StartupAdd: {
      name,
      path,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}

/**
 * Removes an application entry from Windows startup configuration.
 */
export async function removeStartupApp(
  name: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  const payload: StartupRemovePayload = {
    StartupRemove: {
      name,
    },
  };
  return apiClient.post<{ ok: boolean }>("/command", payload, options);
}

// ============================================================================
// 4. Network / LAN Distributed Nodes API
// ============================================================================

/**
 * Gets current network role (standalone/available/admin).
 */
export async function getNetworkRole(options?: RequestOptions): Promise<{ ok: boolean; role: NetworkRole }> {
  return apiClient.get<{ ok: boolean; role: NetworkRole }>("/network/role", options);
}

/**
 * Sets current network role and syncs with Core terminal server.
 */
export async function setNetworkRole(
  role: NetworkRole,
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>("/network/role", { role }, options);
}

/**
 * Lists all known LAN machines and active admin target.
 */
export async function getAdminMachines(
  options?: RequestOptions
): Promise<{ ok: boolean; machines: NetworkMachine[]; active_machine?: string }> {
  return apiClient.get<{ ok: boolean; machines: NetworkMachine[]; active_machine?: string }>("/network/admin/machines", options);
}

/**
 * Switches the active remote machine view.
 */
export async function switchAdminMachine(
  machineId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/network/admin/switch", { machine_id: machineId }, options);
}

/**
 * Gets latest polled telemetry and process data for a specific remote machine.
 */
export async function getAdminMachineData(
  machineId: string,
  options?: RequestOptions
): Promise<{ ok: boolean; data: RemoteMachineData }> {
  return apiClient.get<{ ok: boolean; data: RemoteMachineData }>(`/network/admin/data/${encodeURIComponent(machineId)}`, options);
}

/**
 * Executes a remote action on a specific machine.
 */
export async function sendAdminMachineAction(
  machineId: string,
  action: string,
  payload?: Record<string, unknown>,
  options?: RequestOptions
): Promise<{ ok: boolean; result?: string }> {
  return apiClient.post<{ ok: boolean; result?: string }>("/network/admin/action", {
    machine_id: machineId,
    action,
    payload,
  }, options);
}

/**
 * Adds a remote machine IP:port to admin watch list.
 */
export async function addAdminMachine(
  ip: string,
  port: number = 9000,
  name?: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/network/admin/add", { ip, port, name }, options);
}

/**
 * Removes a remote machine from admin watch list.
 */
export async function removeAdminMachine(
  machineId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/network/admin/remove", { machine_id: machineId }, options);
}
