/**
 * Fluffy Desktop - Settings & AI/Model API Service
 * 
 * Typed API client bindings for LLM model configuration (HTTP 5123 /llm/*),
 * system preferences, and advanced maintenance actions.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  LlmConfigResponse,
  LlmUpdateConfigPayload,
  LlmModelsResponse,
  LlmModelSummary,
  UserPreferences,
  NormalizeResult,
} from "../../types/contracts";

/**
 * Fetch current OpenRouter / LLM configuration.
 */
export async function fetchLlmConfig(
  options?: RequestOptions
): Promise<LlmConfigResponse> {
  return apiClient.get<LlmConfigResponse>("/llm/config", options);
}

/**
 * Update OpenRouter / LLM API key and model selection.
 */
export async function updateLlmConfig(
  payload: LlmUpdateConfigPayload,
  options?: RequestOptions
): Promise<LlmConfigResponse> {
  return apiClient.post<LlmConfigResponse>("/llm/config", payload, options);
}

/**
 * Fetch list of available models from OpenRouter.
 */
export async function fetchLlmModels(
  options?: RequestOptions
): Promise<LlmModelSummary[]> {
  const res = await apiClient.get<LlmModelsResponse>("/llm/models", options);
  return res.models || [];
}

/**
 * Fetch user preferences stored in Memory engine.
 */
export async function fetchUserPreferences(
  options?: RequestOptions
): Promise<UserPreferences> {
  const res = await apiClient.get<{ ok: boolean; preferences?: UserPreferences }>("/memory/preferences", options);
  return res.preferences || {};
}

/**
 * Save user preferences to Memory engine.
 */
export async function saveUserPreferences(
  preferences: UserPreferences,
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>("/memory/preferences", { preferences }, options);
}

/**
 * Execute system normalization / optimization.
 */
export async function executeNormalize(
  options?: RequestOptions
): Promise<NormalizeResult> {
  return apiClient.post<NormalizeResult>("/normalize", undefined, options);
}

/**
 * Clear guardian alerts and temporary threat blocks.
 */
export async function clearGuardianThreats(
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>("/clear_guardian", undefined, options);
}

/**
 * Reset active conversational session context.
 */
export async function resetSessionContext(
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>("/session/reset", undefined, options);
}
