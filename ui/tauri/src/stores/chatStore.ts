/**
 * Fluffy Desktop - Chat & Voice Store
 * 
 * Centralized state coordinator for conversational Brain interactions:
 * - Active session message transcript
 * - Real-time SSE streaming responses & cancellation
 * - Multi-turn session history
 * - Local Vosk STT & TTS speech controls
 */

import { useSyncExternalStore } from "react";
import {
  sendChatMessage,
  streamChatMessage,
  createChatSession,
  fetchChatSessions,
  fetchChatSession,
  deleteChatSession,
  fetchCurrentSessionId,
  startStt,
  stopStt,
  fetchSttStatus,
  setTtsMute,
  speakText,
  stopSpeech,
} from "../services/api/chat";
import type {
  ChatMessage,
  ChatSessionSummary,
} from "../types/contracts";

export interface ChatState {
  messages: ChatMessage[];
  activeSessionId: string | null;
  sessions: ChatSessionSummary[];
  isStreaming: boolean;
  streamingMessage: string;
  isSending: boolean;
  useVoice: boolean;
  ttsMuted: boolean;
  sttListening: boolean;
  sttText: string;
  sttPartial: string;
  isSpeaking: boolean;
  loading: boolean;
  error: Error | null;

  // Convenience aliases for UI components
  isListening?: boolean;
  isTtsMuted?: boolean;
  useVoiceFeedback?: boolean;
  finalTranscript?: string;
  partialTranscript?: string;
}

class ChatStoreManager {
  private state: ChatState = {
    messages: [],
    activeSessionId: null,
    sessions: [],
    isStreaming: false,
    streamingMessage: "",
    isSending: false,
    useVoice: false,
    ttsMuted: false,
    sttListening: false,
    sttText: "",
    sttPartial: "",
    isSpeaking: false,
    loading: false,
    error: null,
    isListening: false,
    isTtsMuted: false,
    useVoiceFeedback: false,
    finalTranscript: "",
    partialTranscript: "",
  };

  private listeners = new Set<() => void>();
  private activeAbortController: AbortController | null = null;
  private sttPollInterval: ReturnType<typeof setInterval> | null = null;

  public getState(): ChatState {
    return this.state;
  }

  private setState(partial: Partial<ChatState>): void {
    const next: ChatState = { ...this.state, ...partial };
    // Maintain synchronized convenience aliases
    next.isListening = next.sttListening;
    next.isTtsMuted = next.ttsMuted;
    next.useVoiceFeedback = next.useVoice;
    next.finalTranscript = next.sttText;
    next.partialTranscript = next.sttPartial;
    this.state = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Load all chat sessions and the active session ID.
   */
  public loadSessions = async (): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      const [sessions, currentSess] = await Promise.all([
        fetchChatSessions().catch(() => []),
        fetchCurrentSessionId().catch(() => ({ ok: false, session_id: "" })),
      ]);

      const activeId = currentSess.ok && currentSess.session_id
        ? currentSess.session_id
        : (sessions.length > 0 ? sessions[0].id : null);

      this.setState({
        sessions,
        activeSessionId: activeId,
        loading: false,
      });

      if (activeId) {
        await this.loadSessionMessages(activeId);
      }
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Load message history for a specific session.
   */
  public loadSessionMessages = async (sessionId: string): Promise<void> => {
    try {
      const detail = await fetchChatSession(sessionId);
      if (detail && Array.isArray(detail.messages)) {
        // Normalize messages to standard ChatMessage structure
        const normalized: ChatMessage[] = detail.messages.map((m, idx) => {
          const role = (m.role || (m.type === "user" ? "user" : "assistant")) as ChatMessage["role"];
          return {
            id: m.id || `msg-${sessionId}-${idx}-${Date.now()}`,
            role,
            content: m.content || m.text || "",
            timestamp: m.timestamp || Date.now(),
            command_result: m.command_result,
            type: m.type,
          };
        });

        this.setState({
          activeSessionId: sessionId,
          messages: normalized,
        });
      }
    } catch {
      // If error loading messages, keep existing messages
    }
  };

  /**
   * Switch active chat session.
   */
  public switchSession = async (sessionId: string): Promise<void> => {
    this.stopGeneration();
    this.setState({ activeSessionId: sessionId });
    await this.loadSessionMessages(sessionId);
  };

  /**
   * Create and switch to a brand-new chat session.
   */
  public newSession = async (): Promise<string | null> => {
    this.stopGeneration();
    try {
      const resp = await createChatSession();
      if (resp.ok && resp.session_id) {
        const newSummary: ChatSessionSummary = {
          id: resp.session_id,
          title: "New Conversation",
          created: Date.now(),
          last_updated: Date.now(),
          message_count: 0,
        };

        this.setState({
          sessions: [newSummary, ...this.state.sessions],
          activeSessionId: resp.session_id,
          messages: [],
        });

        return resp.session_id;
      }
    } catch (err) {
      console.error("[ChatStore] Failed to create new session:", err);
    }
    return null;
  };

  /**
   * Delete a session.
   */
  public deleteSession = async (sessionId: string): Promise<boolean> => {
    try {
      await deleteChatSession(sessionId);
      const remaining = this.state.sessions.filter((s) => s.id !== sessionId);
      let nextActiveId = this.state.activeSessionId;

      if (this.state.activeSessionId === sessionId) {
        nextActiveId = remaining.length > 0 ? remaining[0].id : null;
      }

      this.setState({
        sessions: remaining,
        activeSessionId: nextActiveId,
        messages: nextActiveId ? this.state.messages : [],
      });

      if (nextActiveId && nextActiveId !== sessionId) {
        await this.loadSessionMessages(nextActiveId);
      }
      return true;
    } catch (err) {
      console.error("[ChatStore] Failed to delete session:", err);
      return false;
    }
  };

  /**
   * Send a user chat message with SSE streaming or regular execution.
   */
  public sendMessage = async (text: string, useStreaming = true): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || this.state.isSending || this.state.isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const currentMessages = [...this.state.messages, userMessage];
    this.setState({
      messages: currentMessages,
      isSending: true,
      isStreaming: useStreaming,
      streamingMessage: "",
      error: null,
    });

    const sessionId = this.state.activeSessionId || undefined;
    const useVoice = this.state.useVoice;

    // Use SSE streaming when enabled
    if (useStreaming) {
      const abortController = new AbortController();
      this.activeAbortController = abortController;

      try {
        let accumulated = "";
        const fullResponse = await streamChatMessage(
          trimmed,
          useVoice,
          (chunk) => {
            accumulated += chunk;
            this.setState({ streamingMessage: accumulated });
          },
          abortController.signal
        );

        const assistantMessage: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: fullResponse || accumulated,
          timestamp: Date.now(),
        };

        this.setState({
          messages: [...currentMessages, assistantMessage],
          isStreaming: false,
          streamingMessage: "",
          isSending: false,
        });
      } catch (err) {
        if (abortController.signal.aborted) {
          // Cancelled by user
          this.setState({
            isStreaming: false,
            streamingMessage: "",
            isSending: false,
          });
        } else {
          // Error occurred -> add error message bubble
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: "error",
            content: `Chat request failed: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          };

          this.setState({
            messages: [...currentMessages, errorMsg],
            isStreaming: false,
            streamingMessage: "",
            isSending: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      } finally {
        this.activeAbortController = null;
      }
    } else {
      // Non-streaming fallback
      try {
        const resp = await sendChatMessage(trimmed, sessionId, useVoice);

        const role = resp.type === "command" ? "command" : "assistant";
        const content = resp.message || "Command executed.";

        const assistantMessage: ChatMessage = {
          id: `resp-${Date.now()}`,
          role,
          content,
          command_result: resp.result,
          type: resp.type,
          timestamp: Date.now(),
        };

        this.setState({
          messages: [...currentMessages, assistantMessage],
          isSending: false,
        });
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "error",
          content: `Failed to process message: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };

        this.setState({
          messages: [...currentMessages, errorMsg],
          isSending: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  };

  /**
   * Stop active streaming response.
   */
  public stopGeneration = (): void => {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    if (this.state.isStreaming && this.state.streamingMessage) {
      const partialMsg: ChatMessage = {
        id: `partial-${Date.now()}`,
        role: "assistant",
        content: `${this.state.streamingMessage} [Interrupted]`,
        timestamp: Date.now(),
      };

      this.setState({
        messages: [...this.state.messages, partialMsg],
        isStreaming: false,
        streamingMessage: "",
        isSending: false,
      });
    } else {
      this.setState({
        isStreaming: false,
        streamingMessage: "",
        isSending: false,
      });
    }
  };

  /**
   * Retries the last user query.
   */
  public retryLastMessage = async (): Promise<void> => {
    const userMsgs = this.state.messages.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return;

    const lastUserMsg = userMsgs[userMsgs.length - 1];
    await this.sendMessage(lastUserMsg.content);
  };

  /**
   * Starts local Vosk STT microphone listening.
   */
  public startVoiceInput = async (): Promise<boolean> => {
    try {
      const resp = await startStt();
      if (resp.ok) {
        this.setState({
          sttListening: true,
          sttText: "",
          sttPartial: "",
        });

        // Start polling STT status
        this.startSttPolling();
        return true;
      }
    } catch (err) {
      console.error("[ChatStore] Error starting STT:", err);
    }
    return false;
  };

  /**
   * Stops local Vosk STT microphone listening.
   */
  public stopVoiceInput = async (): Promise<string> => {
    this.stopSttPolling();
    try {
      await stopStt();
    } catch {
      // Ignore cleanup error
    }

    const transcribed = this.state.sttText || this.state.sttPartial;
    this.setState({
      sttListening: false,
      sttText: "",
      sttPartial: "",
    });

    return transcribed;
  };

  private startSttPolling(): void {
    this.stopSttPolling();
    this.sttPollInterval = setInterval(async () => {
      if (!this.state.sttListening) return;
      try {
        const status = await fetchSttStatus();
        const transcription = status.text || (status as { transcription?: string }).transcription || "";
        const partial = status.partial || "";
        
        if (transcription) {
          this.setState({ sttText: transcription, sttPartial: "" });
        } else if (partial) {
          this.setState({ sttPartial: partial });
        }

        // If backend reported listening ended
        if (status.is_listening === false || (status as { listening?: boolean }).listening === false) {
          if (this.state.sttListening) {
            this.setState({ sttListening: false });
            this.stopSttPolling();
          }
        }
      } catch {
        // Continue polling
      }
    }, 500);
  }

  private stopSttPolling(): void {
    if (this.sttPollInterval !== null) {
      clearInterval(this.sttPollInterval);
      this.sttPollInterval = null;
    }
  }

  /**
   * Toggle Voice TTS response toggle.
   */
  public toggleVoiceFeedback = (): void => {
    this.setState({ useVoice: !this.state.useVoice });
  };

  /**
   * Toggle TTS Mute state.
   */
  public toggleTtsMute = async (): Promise<void> => {
    try {
      const nextMuted = !this.state.ttsMuted;
      const resp = await setTtsMute(nextMuted);
      this.setState({ ttsMuted: resp.muted });
    } catch {
      this.setState({ ttsMuted: !this.state.ttsMuted });
    }
  };

  /**
   * Set TTS Mute state directly.
   */
  public setTtsMuted = async (muted: boolean): Promise<void> => {
    try {
      const resp = await setTtsMute(muted);
      this.setState({ ttsMuted: resp.muted });
    } catch {
      this.setState({ ttsMuted: muted });
    }
  };

  /**
   * Speak text via TTS.
   */
  public speak = async (text: string): Promise<void> => {
    this.setState({ isSpeaking: true });
    try {
      await speakText(text);
    } catch (err) {
      console.error("[ChatStore] Error speaking text:", err);
    } finally {
      setTimeout(() => {
        if (this.state.isSpeaking) {
          this.setState({ isSpeaking: false });
        }
      }, Math.max(2000, text.length * 80));
    }
  };

  /**
   * Stop speech.
   */
  public stopSpeaking = async (): Promise<void> => {
    this.setState({ isSpeaking: false });
    try {
      await stopSpeech();
    } catch (err) {
      console.error("[ChatStore] Error stopping speech:", err);
    }
  };

  /**
   * Clear active message list buffer.
   */
  public clearCurrentMessages = (): void => {
    this.setState({ messages: [] });
  };

  /**
   * Reset store (for testing).
   */
  public _resetForTest(): void {
    this.stopGeneration();
    this.stopSttPolling();
    this.state = {
      messages: [],
      activeSessionId: null,
      sessions: [],
      isStreaming: false,
      streamingMessage: "",
      isSending: false,
      useVoice: false,
      ttsMuted: false,
      sttListening: false,
      sttText: "",
      sttPartial: "",
      isSpeaking: false,
      loading: false,
      error: null,
      isListening: false,
      isTtsMuted: false,
      useVoiceFeedback: false,
      finalTranscript: "",
      partialTranscript: "",
    };
  }
}

// Global chat store singleton
export const chatStore = new ChatStoreManager();

export type ChatStoreState = ChatState & {
  isListening: boolean;
  isLoading: boolean;
  isTtsMuted: boolean;
  isSpeaking: boolean;
  useVoiceFeedback: boolean;
  partialTranscript: string;
  finalTranscript: string;
  loadSessions: () => Promise<void>;
  loadSessionMessages: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  newSession: () => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  sendMessage: (text: string, useStreaming?: boolean) => Promise<void>;
  stopGeneration: () => void;
  retryLastMessage: () => Promise<void>;
  startVoiceInput: () => Promise<boolean>;
  stopVoiceInput: () => Promise<string>;
  toggleVoiceFeedback: () => void;
  toggleTtsMute: () => Promise<void>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  clearCurrentMessages: () => void;
};

let lastRawChatState: ChatState | null = null;
let cachedEnrichedChatState: ChatStoreState | null = null;

function getEnrichedChatState(): ChatStoreState {
  const raw = chatStore.getState();
  if (raw === lastRawChatState && cachedEnrichedChatState !== null) {
    return cachedEnrichedChatState;
  }
  lastRawChatState = raw;
  cachedEnrichedChatState = {
    ...raw,
    isListening: raw.sttListening,
    isLoading: raw.loading,
    isTtsMuted: raw.ttsMuted,
    isSpeaking: raw.isSending,
    useVoiceFeedback: raw.useVoice,
    partialTranscript: raw.sttPartial,
    finalTranscript: raw.sttText,
    loadSessions: chatStore.loadSessions,
    loadSessionMessages: chatStore.loadSessionMessages,
    switchSession: chatStore.switchSession,
    newSession: chatStore.newSession,
    deleteSession: chatStore.deleteSession,
    sendMessage: chatStore.sendMessage,
    stopGeneration: chatStore.stopGeneration,
    retryLastMessage: chatStore.retryLastMessage,
    startVoiceInput: chatStore.startVoiceInput,
    stopVoiceInput: chatStore.stopVoiceInput,
    toggleVoiceFeedback: chatStore.toggleVoiceFeedback,
    toggleTtsMute: chatStore.toggleTtsMute,
    speak: chatStore.speak,
    stopSpeaking: chatStore.stopSpeaking,
    clearCurrentMessages: chatStore.clearCurrentMessages,
  };
  return cachedEnrichedChatState;
}

/**
 * Standard React hook to subscribe to Chat state & actions.
 */
export function useChatStore<T = ChatStoreState>(
  selector: (state: ChatStoreState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(getEnrichedChatState());
  return useSyncExternalStore(chatStore.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

