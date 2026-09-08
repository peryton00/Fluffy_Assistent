/**
 * Fluffy Desktop - Memory Store
 * 
 * Centralized state coordinator for Fluffy Memory:
 * - Long-term profile & learned behavior
 * - User preferences key-value store
 * - Chat/Conversation memory sessions
 * - Active session context & pending intent status
 */

import { useSyncExternalStore } from "react";
import {
  fetchLongTermMemory,
  updateLongTermMemory,
  fetchPreferences,
  setPreference,
  fetchChatSessions,
  fetchChatSession,
  deleteChatSession,
  fetchCurrentSessionId,
  fetchSessionStatus,
  resetSessionMemory,
} from "../services/api/memory";
import type {
  LongTermMemory,
  UserProfile,
  SessionContextSummary,
  ChatSessionSummary,
  ChatSessionDetail,
} from "../types/contracts";

export interface MemoryState {
  memory: LongTermMemory | null;
  profile: UserProfile | null;
  preferences: Record<string, unknown>;
  sessions: ChatSessionSummary[];
  currentSessionId: string | null;
  activeSessionId: string | null;
  selectedSessionDetail: ChatSessionDetail | null;
  sessionStatus: SessionContextSummary | null;
  loading: boolean;
  error: Error | null;
  lastFetched: number | null;
}

class MemoryStoreManager {
  private state: MemoryState = {
    memory: null,
    profile: null,
    preferences: {},
    sessions: [],
    currentSessionId: null,
    activeSessionId: null,
    selectedSessionDetail: null,
    sessionStatus: null,
    loading: false,
    error: null,
    lastFetched: null,
  };

  private listeners = new Set<() => void>();

  public getState(): MemoryState {
    return this.state;
  }

  private setState(partial: Partial<MemoryState>): void {
    this.state = { ...this.state, ...partial };
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
   * Loads complete long-term memory and extracts user profile.
   */
  public loadMemory = async (force: boolean = false): Promise<void> => {
    if (!force && this.state.memory !== null) {
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const memory = await fetchLongTermMemory();
      const profile = (memory as Record<string, unknown>).user_profile
        ? ((memory as Record<string, unknown>).user_profile as UserProfile)
        : (memory as UserProfile);

      this.setState({
        memory,
        profile,
        loading: false,
        error: null,
        lastFetched: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  public loadProfile = async (force: boolean = false): Promise<void> => {
    return this.loadMemory(force);
  };

  /**
   * Saves updated profile back to long-term memory.
   */
  public saveProfile = async (updatedProfile: UserProfile): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      const payload = {
        user_profile: updatedProfile,
        ...updatedProfile,
      };
      const updated = await updateLongTermMemory(payload);
      const profile = (updated as Record<string, unknown>).user_profile
        ? ((updated as Record<string, unknown>).user_profile as UserProfile)
        : (updated as UserProfile);

      this.setState({
        memory: updated,
        profile: profile && Object.keys(profile).length > 0 ? profile : updatedProfile,
        loading: false,
        error: null,
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  /**
   * Loads preferences dictionary.
   */
  public loadPreferences = async (force: boolean = false): Promise<void> => {
    if (!force && Object.keys(this.state.preferences).length > 0) {
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const preferences = await fetchPreferences();
      this.setState({
        preferences,
        loading: false,
        error: null,
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Sets a specific preference.
   */
  public updatePreference = async (key: string, value: unknown): Promise<void> => {
    try {
      await setPreference(key, value);
      this.setState({
        preferences: { ...this.state.preferences, [key]: value },
      });
      await this.loadMemory(true);
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  /**
   * Loads all conversation memory sessions.
   */
  public loadSessions = async (force: boolean = false): Promise<void> => {
    if (!force && this.state.sessions.length > 0) {
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const [sessions, currentSessionId] = await Promise.all([
        fetchChatSessions(),
        fetchCurrentSessionId().catch(() => null),
      ]);
      this.setState({
        sessions,
        currentSessionId,
        activeSessionId: currentSessionId,
        loading: false,
        error: null,
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  public loadActiveSession = async (): Promise<void> => {
    try {
      const [currentSessionId, sessionStatus] = await Promise.all([
        fetchCurrentSessionId().catch(() => null),
        fetchSessionStatus().catch(() => ({})),
      ]);
      this.setState({
        currentSessionId,
        activeSessionId: currentSessionId,
        sessionStatus,
      });
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Loads detailed messages for a specific session.
   */
  public loadSessionDetail = async (sessionId: string): Promise<ChatSessionDetail | null> => {
    try {
      const detail = await fetchChatSession(sessionId);
      this.setState({ selectedSessionDetail: detail });
      return detail;
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return null;
    }
  };

  /**
   * Deletes a session from memory.
   */
  public removeSession = async (sessionId: string): Promise<void> => {
    try {
      await deleteChatSession(sessionId);
      this.setState({
        sessions: this.state.sessions.filter((s) => s.id !== sessionId),
        selectedSessionDetail:
          this.state.selectedSessionDetail?.id === sessionId
            ? null
            : this.state.selectedSessionDetail,
      });
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  /**
   * Loads active runtime session status.
   */
  public loadSessionStatus = async (): Promise<void> => {
    try {
      const sessionStatus = await fetchSessionStatus();
      this.setState({ sessionStatus });
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Resets active runtime session memory.
   */
  public resetSession = async (): Promise<void> => {
    try {
      await resetSessionMemory();
      await this.loadSessionStatus();
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  };

  public resetRuntimeSession = async (): Promise<void> => {
    return this.resetSession();
  };
}

export const memoryStore = new MemoryStoreManager();

export type ExtendedMemoryState = MemoryState & {
  loadMemory: (force?: boolean) => Promise<void>;
  loadProfile: (force?: boolean) => Promise<void>;
  saveProfile: (profile: UserProfile) => Promise<void>;
  loadPreferences: (force?: boolean) => Promise<void>;
  updatePreference: (key: string, value: unknown) => Promise<void>;
  loadSessions: (force?: boolean) => Promise<void>;
  loadActiveSession: () => Promise<void>;
  loadSessionDetail: (sessionId: string) => Promise<ChatSessionDetail | null>;
  removeSession: (sessionId: string) => Promise<void>;
  loadSessionStatus: () => Promise<void>;
  resetSession: () => Promise<void>;
  resetRuntimeSession: () => Promise<void>;
};

let lastRawMemoryState: MemoryState | null = null;
let cachedEnrichedMemoryState: ExtendedMemoryState | null = null;

function getEnrichedMemoryState(): ExtendedMemoryState {
  const raw = memoryStore.getState();
  if (raw === lastRawMemoryState && cachedEnrichedMemoryState !== null) {
    return cachedEnrichedMemoryState;
  }
  lastRawMemoryState = raw;
  cachedEnrichedMemoryState = {
    ...raw,
    loadMemory: memoryStore.loadMemory,
    loadProfile: memoryStore.loadProfile,
    saveProfile: memoryStore.saveProfile,
    loadPreferences: memoryStore.loadPreferences,
    updatePreference: memoryStore.updatePreference,
    loadSessions: memoryStore.loadSessions,
    loadActiveSession: memoryStore.loadActiveSession,
    loadSessionDetail: memoryStore.loadSessionDetail,
    removeSession: memoryStore.removeSession,
    loadSessionStatus: memoryStore.loadSessionStatus,
    resetSession: memoryStore.resetSession,
    resetRuntimeSession: memoryStore.resetRuntimeSession,
  };
  return cachedEnrichedMemoryState;
}

/**
 * React hook for consuming Memory state.
 */
export function useMemoryStore(): ExtendedMemoryState {
  return useSyncExternalStore(
    memoryStore.subscribe,
    getEnrichedMemoryState,
    getEnrichedMemoryState
  );
}
