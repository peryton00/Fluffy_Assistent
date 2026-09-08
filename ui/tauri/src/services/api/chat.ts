/**
 * Fluffy Desktop - Chat & Voice API Service
 * 
 * Typed API client bindings for Python Brain conversational chat,
 * Server-Sent Events (SSE) streaming, session management, and local Vosk/TTS voice interfaces.
 */

import { apiClient, ApiClientError, type RequestOptions } from "./client";
import { getToken, refreshToken, clearToken } from "../auth/token";
import type {
  ChatSendMessagePayload,
  ChatSendMessageResponse,
  ChatSessionSummary,
  ChatSessionDetail,
  SttStatusResponse,
  TtsMuteResponse,
} from "../../types/contracts";

/**
 * Send a chat message to Python Brain.
 * Processes local commands immediately or queries LLM.
 */
export async function sendChatMessage(
  message: string,
  sessionId?: string,
  useVoice = false,
  options?: RequestOptions
): Promise<ChatSendMessageResponse> {
  const payload: ChatSendMessagePayload = {
    message,
    session_id: sessionId,
    use_voice: useVoice,
  };
  return apiClient.post<ChatSendMessageResponse>("/chat/message", payload, { timeoutMs: 60000, ...options });
}

/**
 * Creates a new chat session in Python Brain.
 */
export async function createChatSession(
  options?: RequestOptions
): Promise<{ ok: boolean; session_id: string }> {
  return apiClient.post<{ ok: boolean; session_id: string }>("/chat/create_session", undefined, options);
}

/**
 * Retrieves current active session ID from Python Brain.
 */
export async function fetchCurrentSessionId(
  options?: RequestOptions
): Promise<{ ok: boolean; session_id: string }> {
  return apiClient.get<{ ok: boolean; session_id: string }>("/chat/current_session", options);
}

/**
 * Lists all conversational chat sessions.
 */
export async function fetchChatSessions(
  options?: RequestOptions
): Promise<ChatSessionSummary[]> {
  const resp = await apiClient.get<{ ok: boolean; sessions: ChatSessionSummary[] }>("/chat/sessions", options);
  return Array.isArray(resp.sessions) ? resp.sessions : [];
}

/**
 * Retrieves message transcript for a specific chat session.
 */
export async function fetchChatSession(
  sessionId: string,
  options?: RequestOptions
): Promise<ChatSessionDetail> {
  const resp = await apiClient.get<{ ok: boolean; session: ChatSessionDetail }>(
    `/chat/session/${encodeURIComponent(sessionId)}`,
    options
  );
  return resp.session;
}

/**
 * Deletes a chat session from memory.
 */
export async function deleteChatSession(
  sessionId: string,
  options?: RequestOptions
): Promise<boolean> {
  const resp = await apiClient.delete<{ ok: boolean }>(
    `/chat/session/${encodeURIComponent(sessionId)}`,
    undefined,
    options
  );
  return !!resp.ok;
}

/**
 * Saves a message directly into chat history.
 */
export async function saveChatMessage(
  sessionId: string,
  message: Record<string, unknown>,
  options?: RequestOptions
): Promise<boolean> {
  const resp = await apiClient.post<{ ok: boolean }>(
    "/chat/save_message",
    { session_id: sessionId, message },
    options
  );
  return !!resp.ok;
}

/**
 * Real Server-Sent Events (SSE) streaming from POST /chat/stream.
 * Progressive token delivery with AbortSignal cancellation.
 */
export async function streamChatMessage(
  message: string,
  useVoice = false,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const url = "http://127.0.0.1:5123/chat/stream";

  let isRetry = false;
  const executeStream = async (): Promise<string> => {
    let token = "";
    try {
      token = await getToken(isRetry);
    } catch {
      // Continue without token if dev mode allows
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    };
    if (token) {
      headers["X-Fluffy-Token"] = token;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, use_voice: useVoice }),
      signal,
    });

    if ((response.status === 401 || response.status === 403) && !isRetry) {
      isRetry = true;
      clearToken();
      await refreshToken();
      return executeStream();
    }

    if (!response.ok) {
      throw new ApiClientError(
        `Streaming failed with status ${response.status}`,
        response.status === 401 || response.status === 403 ? "AUTHENTICATION_FAILED" : "HTTP_ERROR",
        "/chat/stream",
        response.status
      );
    }

    const contentType = response.headers.get("content-type") || "";

    // If backend returned immediate JSON (e.g. for command execution)
    if (contentType.includes("application/json")) {
      const jsonResp = await response.json();
      const text = jsonResp.message || jsonResp.result || "";
      if (onChunk && text) {
        onChunk(text);
      }
      return text;
    }

    // Stream SSE chunks
    if (!response.body) {
      throw new Error("No response body available for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;

          try {
            const dataObj = JSON.parse(dataStr);
            if (dataObj.done) {
              break;
            }
            if (dataObj.chunk) {
              accumulatedText += dataObj.chunk;
              if (onChunk) {
                onChunk(dataObj.chunk);
              }
            }
          } catch {
            // If raw text chunk without JSON envelope
            accumulatedText += dataStr;
            if (onChunk) {
              onChunk(dataStr);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedText;
  };

  return executeStream();
}

// ============================================================================
// Voice / STT / TTS Methods
// ============================================================================

/**
 * Starts Vosk STT listening test.
 */
export async function startStt(
  options?: RequestOptions
): Promise<{ ok: boolean; status: string }> {
  return apiClient.post<{ ok: boolean; status: string }>("/test_stt", undefined, options);
}

/**
 * Stops Vosk STT listening.
 */
export async function stopStt(
  options?: RequestOptions
): Promise<{ ok: boolean; status: string }> {
  return apiClient.post<{ ok: boolean; status: string }>("/stop_stt", undefined, options);
}

/**
 * Fetches current STT transcription and listening state.
 */
export async function fetchSttStatus(
  options?: RequestOptions
): Promise<SttStatusResponse> {
  return apiClient.get<SttStatusResponse>("/stt_status", options);
}

/**
 * Triggers local TTS to speak custom text.
 */
export async function speakText(
  text: string,
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/tts/speak", { text }, options);
}

/**
 * Immediately stops any playing speech.
 */
export async function stopSpeech(
  options?: RequestOptions
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/tts/stop", undefined, options);
}

/**
 * Toggles or sets TTS mute status.
 */
export async function setTtsMute(
  muted?: boolean,
  options?: RequestOptions
): Promise<TtsMuteResponse> {
  return apiClient.post<TtsMuteResponse>("/tts/mute", { muted }, options);
}

/**
 * Retrieves current TTS mute status.
 */
export async function fetchTtsMuteStatus(
  options?: RequestOptions
): Promise<TtsMuteResponse> {
  return apiClient.get<TtsMuteResponse>("/tts/mute/status", options);
}

/**
 * Executes a transcribed voice command through the unified AI flow.
 */
export async function executeVoiceCommand(
  command: string,
  options?: RequestOptions
): Promise<{ ok: boolean; command: string; type: string; result: unknown }> {
  return apiClient.post<{ ok: boolean; command: string; type: string; result: unknown }>(
    "/execute_command",
    { command },
    { timeoutMs: 60000, ...options }
  );
}
