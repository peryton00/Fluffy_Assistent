/**
 * Fluffy Desktop - Extensions API Service
 * 
 * Typed API client bindings for Python Brain Extensions subsystem (HTTP 5123 /extensions/*).
 * Zero invented endpoints. Matches brain/routes/extension_routes.py contract.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  ExtensionSummary,
  ExtensionListResponse,
  ExtensionDetail,
  ExtensionDetailResponse,
  ExtensionCodeResponse,
  ExtensionSaveCodePayload,
  ExtensionSaveCodeResponse,
  ExtensionReloadResponse,
  ExtensionDeleteResponse,
  ExtensionToggleResponse,
  ExtensionRunPayload,
  ExtensionRunResponse,
  ExtensionOpenVscodeResponse,
} from "../../types/contracts";

/**
 * Fetch list of all installed extensions.
 */
export async function fetchExtensions(
  options?: RequestOptions
): Promise<ExtensionSummary[]> {
  const res = await apiClient.get<ExtensionListResponse>("/extensions", options);
  return res.extensions || [];
}

/**
 * Fetch detailed metadata for a specific extension.
 */
export async function fetchExtensionDetail(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionDetail | null> {
  const res = await apiClient.get<ExtensionDetailResponse>(`/extensions/${encodeURIComponent(intent)}`, options);
  return res.extension || null;
}

/**
 * Fetch the handler source code of an extension.
 */
export async function fetchExtensionCode(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionCodeResponse> {
  return apiClient.get<ExtensionCodeResponse>(`/extensions/${encodeURIComponent(intent)}/code`, options);
}

/**
 * Save updated source code and trigger live hot-reload.
 */
export async function saveExtensionCode(
  intent: string,
  code: string,
  language = "python",
  options?: RequestOptions
): Promise<ExtensionSaveCodeResponse> {
  const payload: ExtensionSaveCodePayload = { code, language };
  return apiClient.put<ExtensionSaveCodeResponse>(
    `/extensions/${encodeURIComponent(intent)}/code`,
    payload,
    options
  );
}

/**
 * Force reload an extension module into the active runtime.
 */
export async function reloadExtension(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionReloadResponse> {
  return apiClient.post<ExtensionReloadResponse>(
    `/extensions/${encodeURIComponent(intent)}/reload`,
    undefined,
    options
  );
}

/**
 * Delete an extension from the registry and disk.
 */
export async function deleteExtension(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionDeleteResponse> {
  return apiClient.delete<ExtensionDeleteResponse>(
    `/extensions/${encodeURIComponent(intent)}`,
    options
  );
}

/**
 * Toggle enable/disable status for an extension.
 */
export async function toggleExtension(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionToggleResponse> {
  return apiClient.post<ExtensionToggleResponse>(
    `/extensions/${encodeURIComponent(intent)}/toggle`,
    undefined,
    options
  );
}

/**
 * Execute an extension handler in test mode.
 */
export async function runExtension(
  intent: string,
  payload?: Record<string, unknown>,
  options?: RequestOptions
): Promise<ExtensionRunResponse> {
  const reqPayload: ExtensionRunPayload = { payload: payload || {} };
  return apiClient.post<ExtensionRunResponse>(
    `/extensions/${encodeURIComponent(intent)}/run`,
    reqPayload,
    options
  );
}

/**
 * Open the extension directory in VS Code.
 */
export async function openExtensionInVsCode(
  intent: string,
  options?: RequestOptions
): Promise<ExtensionOpenVscodeResponse> {
  return apiClient.post<ExtensionOpenVscodeResponse>(
    `/extensions/${encodeURIComponent(intent)}/open-vscode`,
    undefined,
    options
  );
}

/**
 * Get the direct URL for an extension's custom Web UI.
 */
export function getExtensionWebUiUrl(intent: string): string {
  const base = apiClient.getBaseUrl();
  return `${base}/extensions/${encodeURIComponent(intent)}/ui`;
}
