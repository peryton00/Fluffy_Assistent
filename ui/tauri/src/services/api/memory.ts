/**
 * Fluffy Desktop - Memory API Service
 * 
 * Typed service client for Fluffy Memory operations:
 * - Long-term user profile & learned behavior (GET/POST /memory)
 * - User preferences key-value store (GET/POST /memory/preferences)
 * - Chat & conversation session memory (GET /chat/sessions, GET/DELETE /chat/session/<id>, GET /chat/current_session)
 * - Active session context & pending intent status (GET /session/status, POST /session/reset)
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  LongTermMemory,
  SessionContextSummary,
  ChatSessionSummary,
  ChatSessionDetail,
} from "../../types/contracts";

/**
 * Fetches the complete persisted long-term user memory and profile.
 */
export async function fetchLongTermMemory(
  options?: RequestOptions
): Promise<LongTermMemory> {
  const res = await apiClient.get<{ ok?: boolean; memory?: LongTermMemory }>(
    "/memory",
    options
  );
  return res.memory || {};
}

/**
 * Updates or merges data into long-term user memory.
 */
export async function updateLongTermMemory(
  data: Record<string, unknown>,
  options?: RequestOptions
): Promise<LongTermMemory> {
  const res = await apiClient.post<{ ok?: boolean; memory?: LongTermMemory }>(
    "/memory",
    data,
    options
  );
  return res.memory || {};
}

/**
 * Fetches user preferences dictionary.
 */
export async function fetchPreferences(
  options?: RequestOptions
): Promise<Record<string, unknown>> {
  const res = await apiClient.get<{ ok?: boolean; preferences?: Record<string, unknown> }>(
    "/memory/preferences",
    options
  );
  return res.preferences || {};
}

/**
 * Sets a specific user preference key-value pair.
 */
export async function setPreference(
  key: string,
  value: unknown,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(
    "/memory/preferences",
    { key, value },
    options
  );
}

/**
 * Lists all persisted chat / conversation memory sessions.
 */
export async function fetchChatSessions(
  options?: RequestOptions
): Promise<ChatSessionSummary[]> {
  const res = await apiClient.get<{ ok?: boolean; sessions?: ChatSessionSummary[] }>(
    "/chat/sessions",
    options
  );
  return Array.isArray(res.sessions) ? res.sessions : [];
}

/**
 * Loads a specific chat session with its full message history.
 */
export async function fetchChatSession(
  sessionId: string,
  options?: RequestOptions
): Promise<ChatSessionDetail | null> {
  const res = await apiClient.get<{ ok?: boolean; session?: ChatSessionDetail }>(
    `/chat/session/${encodeURIComponent(sessionId)}`,
    options
  );
  return res.session || null;
}

/**
 * Deletes a chat session from conversation memory.
 */
export async function deleteChatSession(
  sessionId: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>(
    `/chat/session/${encodeURIComponent(sessionId)}`,
    undefined,
    options
  );
}

/**
 * Fetches current active session ID.
 */
export async function fetchCurrentSessionId(
  options?: RequestOptions
): Promise<string | null> {
  const res = await apiClient.get<{ ok?: boolean; session_id?: string | null }>(
    "/chat/current_session",
    options
  );
  return res.session_id || null;
}

/**
 * Fetches runtime session context summary (pending multi-step intents, action context, last exchange).
 */
export async function fetchSessionStatus(
  options?: RequestOptions
): Promise<SessionContextSummary> {
  const res = await apiClient.get<{ ok?: boolean; session?: SessionContextSummary }>(
    "/session/status",
    options
  );
  return res.session || {};
}

/**
 * Resets runtime session memory.
 */
export async function resetSessionMemory(
  options?: RequestOptions
): Promise<{ ok: boolean; message?: string }> {
  return apiClient.post<{ ok: boolean; message?: string }>(
    "/session/reset",
    undefined,
    options
  );
}
