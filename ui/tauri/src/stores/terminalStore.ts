/**
 * Fluffy Desktop - Central Terminal Store
 * 
 * Manages reactive terminal state (connection status, bounded output buffer,
 * command history, active prompt, and connected client nodes).
 * Coordinates with TerminalWebSocketService.
 */

import { useSyncExternalStore } from "react";
import { terminalWsService } from "../services/websocket/terminal";
import type {
  TerminalConnectionState,
  TerminalServerMessage,
  TerminalClientNode,
  TerminalOutputColorTag,
} from "../types/contracts";

export interface TerminalOutputLine {
  id: string;
  tag: string;
  text: string;
  color_tag: TerminalOutputColorTag;
  timestamp: string;
}

export interface TerminalState {
  connectionState: TerminalConnectionState;
  outputLines: TerminalOutputLine[];
  prompt: string;
  clients: TerminalClientNode[];
  alterTarget: string | null;
  adminPort: number;
  clientCount: number;
  mode: string;
  commandHistory: string[];
  historyIndex: number | null;
  savedDraft: string;
  lastError: string | null;
  lastConnectedAt: number | null;
}

export const MAX_OUTPUT_LINES = 2000;
export const MAX_COMMAND_HISTORY = 100;

class TerminalStoreManager {
  private state: TerminalState = {
    connectionState: "disconnected",
    outputLines: [],
    prompt: "fluffy> ",
    clients: [],
    alterTarget: null,
    adminPort: 9000,
    clientCount: 0,
    mode: "Standalone",
    commandHistory: [],
    historyIndex: null,
    savedDraft: "",
    lastError: null,
    lastConnectedAt: null,
  };

  private listeners = new Set<() => void>();
  private lineCounter: number = 0;
  private unsubscribeMsg: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.unsubscribeMsg = terminalWsService.onMessage(this.handleIncomingMessage);
    this.unsubscribeState = terminalWsService.onStateChange(this.handleConnectionStateChange);
  }

  public destroy(): void {
    this.unsubscribeMsg?.();
    this.unsubscribeState?.();
    this.unsubscribeMsg = null;
    this.unsubscribeState = null;
  }

  public getState(): TerminalState {
    return this.state;
  }

  private setState(partial: Partial<TerminalState>): void {
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
   * Connect to backend terminal server.
   */
  public connect = (): void => {
    terminalWsService.connect();
  };

  /**
   * Disconnect from backend terminal server.
   */
  public disconnect = (): void => {
    terminalWsService.disconnect();
  };

  /**
   * Reconnect to backend terminal server.
   */
  public reconnect = (): void => {
    terminalWsService.reconnect();
  };

  /**
   * Send command to backend REPL.
   */
  public sendCommand = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    // Local clear command handling
    if (trimmed === "clear" || trimmed === "cls" || trimmed === "clean") {
      this.clearOutput();
    }

    // Update command history
    const history = [...this.state.commandHistory];
    if (history[history.length - 1] !== trimmed) {
      history.push(trimmed);
      if (history.length > MAX_COMMAND_HISTORY) {
        history.shift();
      }
    }

    this.setState({
      commandHistory: history,
      historyIndex: null,
      savedDraft: "",
    });

    return terminalWsService.sendCommand(trimmed);
  };

  /**
   * Clear local output buffer.
   */
  public clearOutput = (): void => {
    this.setState({ outputLines: [] });
  };

  /**
   * Switch active target client (`f alter <tag>` or `f alter local`).
   */
  public setAlterTarget = (tag: string | null): void => {
    if (tag) {
      this.sendCommand(`f alter ${tag}`);
    } else {
      this.sendCommand("f alter local");
    }
  };

  /**
   * History navigation (Up / Down arrows).
   */
  public navigateHistory = (direction: "up" | "down", currentDraft: string): string => {
    const history = this.state.commandHistory;
    if (history.length === 0) {
      return currentDraft;
    }

    let currentIndex = this.state.historyIndex;
    let savedDraft = this.state.savedDraft;

    if (direction === "up") {
      if (currentIndex === null) {
        savedDraft = currentDraft;
        currentIndex = history.length - 1;
      } else if (currentIndex > 0) {
        currentIndex -= 1;
      }
    } else if (direction === "down") {
      if (currentIndex === null) {
        return currentDraft;
      } else if (currentIndex < history.length - 1) {
        currentIndex += 1;
      } else {
        currentIndex = null;
        this.setState({ historyIndex: null, savedDraft: "" });
        return savedDraft;
      }
    }

    const selectedCommand = currentIndex !== null ? history[currentIndex] : savedDraft;
    this.setState({ historyIndex: currentIndex, savedDraft });
    return selectedCommand;
  };

  /**
   * Reset history navigation cursor.
   */
  public resetHistoryIndex = (): void => {
    if (this.state.historyIndex !== null) {
      this.setState({ historyIndex: null, savedDraft: "" });
    }
  };

  private handleConnectionStateChange = (connectionState: TerminalConnectionState): void => {
    const lastConnectedAt = connectionState === "connected" ? Date.now() : this.state.lastConnectedAt;
    this.setState({
      connectionState,
      lastConnectedAt,
      lastError: connectionState === "error" ? "Connection to Core Terminal failed" : null,
    });
  };

  private handleIncomingMessage = (message: TerminalServerMessage): void => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    switch (message.type) {
      case "output": {
        this.lineCounter += 1;
        const newLine: TerminalOutputLine = {
          id: `line-${this.lineCounter}-${Date.now()}`,
          tag: message.tag || "system",
          text: message.text || "",
          color_tag: message.color_tag || "text",
          timestamp: message.timestamp || new Date().toLocaleTimeString(),
        };

        const currentLines = this.state.outputLines;
        const nextLines = currentLines.length >= MAX_OUTPUT_LINES
          ? [...currentLines.slice(currentLines.length - MAX_OUTPUT_LINES + 1), newLine]
          : [...currentLines, newLine];

        this.setState({ outputLines: nextLines });
        break;
      }

      case "prompt": {
        const promptText = message.text || "fluffy> ";
        // Extract alter target if format is "fluffy [tag]> "
        const alterMatch = promptText.match(/\[(.*?)\]/);
        const alterTarget = alterMatch ? alterMatch[1] : null;

        this.setState({
          prompt: promptText,
          alterTarget,
        });
        break;
      }

      case "status": {
        this.setState({
          adminPort: message.admin_port || 9000,
          clientCount: message.client_count || 0,
          mode: message.mode || "Standalone",
        });
        break;
      }

      case "client_list": {
        this.setState({
          clients: Array.isArray(message.clients) ? message.clients : [],
          clientCount: Array.isArray(message.clients) ? message.clients.length : 0,
        });
        break;
      }
    }
  };

  /**
   * Reset store (for testing cleanup).
   */
  public _resetForTest(): void {
    this.state = {
      connectionState: "disconnected",
      outputLines: [],
      prompt: "fluffy> ",
      clients: [],
      alterTarget: null,
      adminPort: 9000,
      clientCount: 0,
      mode: "Standalone",
      commandHistory: [],
      historyIndex: null,
      savedDraft: "",
      lastError: null,
      lastConnectedAt: null,
    };
    this.lineCounter = 0;
  }
}

// Global terminal store singleton
export const terminalStore = new TerminalStoreManager();

/**
 * Standard React hook to subscribe to Terminal state.
 */
export function useTerminalStore<T = TerminalState>(
  selector: (state: TerminalState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(terminalStore.getState());
  return useSyncExternalStore(terminalStore.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
