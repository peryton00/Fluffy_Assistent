/**
 * Fluffy Desktop - Terminal WebSocket Service
 * 
 * Manages full-duplex WebSocket connection to Fluffy Core Terminal (ws://127.0.0.1:9003).
 * Owns connection lifecycle, auto-reconnect (~3,000ms), and message serialization/deserialization.
 * React components and stores NEVER instantiate WebSockets directly.
 */

import type {
  TerminalServerMessage,
  TerminalCommandMessage,
  TerminalConnectionState,
} from "../../types/contracts";

export const TERMINAL_WS_URL = "ws://127.0.0.1:9003";
export const RECONNECT_DELAY_MS = 3000;

export type MessageHandler = (message: TerminalServerMessage) => void;
export type StateChangeHandler = (state: TerminalConnectionState) => void;

export class TerminalWebSocketService {
  private socket: WebSocket | null = null;
  private connectionState: TerminalConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageListeners = new Set<MessageHandler>();
  private stateListeners = new Set<StateChangeHandler>();
  private url: string;
  private shouldAutoReconnect: boolean = true;
  private isExplicitDisconnect: boolean = false;

  constructor(url: string = TERMINAL_WS_URL) {
    this.url = url;
  }

  /**
   * Current connection state.
   */
  public getState(): TerminalConnectionState {
    return this.connectionState;
  }

  /**
   * Subscribe to incoming parsed messages from Rust Core.
   */
  public onMessage(handler: MessageHandler): () => void {
    this.messageListeners.add(handler);
    return () => {
      this.messageListeners.delete(handler);
    };
  }

  /**
   * Subscribe to connection state changes.
   */
  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  private setState(newState: TerminalConnectionState): void {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      for (const listener of this.stateListeners) {
        try {
          listener(newState);
        } catch (e) {
          console.error("[Terminal WS] State listener error:", e);
        }
      }
    }
  }

  /**
   * Connect to the Core Terminal WebSocket server.
   */
  public connect(): void {
    this.isExplicitDisconnect = false;
    this.shouldAutoReconnect = true;

    // Clear any existing scheduled reconnect timer
    this.clearReconnectTimer();

    // If socket is already open or opening, no-op
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setState(this.connectionState === "disconnected" ? "connecting" : "reconnecting");

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.clearReconnectTimer();
        this.setState("connected");
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleRawMessage(event.data);
      };

      this.socket.onerror = () => {
        if (this.connectionState !== "reconnecting") {
          this.setState("error");
        }
      };

      this.socket.onclose = () => {
        this.socket = null;
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        } else {
          this.setState("disconnected");
        }
      };
    } catch (err) {
      console.error("[Terminal WS] Failed to create WebSocket:", err);
      this.setState("error");
      if (!this.isExplicitDisconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect manually from Core Terminal.
   */
  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.shouldAutoReconnect = false;
    this.clearReconnectTimer();

    if (this.socket) {
      // Remove handlers before closing to prevent spurious triggers
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    this.setState("disconnected");
  }

  /**
   * Force an immediate reconnection.
   */
  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  /**
   * Send a command string to Core REPL.
   */
  public sendCommand(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn("[Terminal WS] Cannot send command; socket is not connected.");
      return false;
    }

    const payload: TerminalCommandMessage = {
      type: "command",
      text,
    };

    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("[Terminal WS] Error sending command:", err);
      return false;
    }
  }

  private handleRawMessage(rawData: unknown): void {
    if (typeof rawData !== "string") {
      return;
    }

    try {
      const parsed = JSON.parse(rawData) as TerminalServerMessage;
      if (parsed && typeof parsed.type === "string") {
        for (const listener of this.messageListeners) {
          try {
            listener(parsed);
          } catch (e) {
            console.error("[Terminal WS] Message listener error:", e);
          }
        }
      }
    } catch (err) {
      console.error("[Terminal WS] Failed to parse message JSON:", rawData, err);
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldAutoReconnect || this.isExplicitDisconnect) {
      return;
    }

    this.setState("reconnecting");
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldAutoReconnect && !this.isExplicitDisconnect) {
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Test helper to simulate incoming server message.
   */
  public _simulateMessage(msg: TerminalServerMessage): void {
    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  /**
   * Test helper to simulate state transition.
   */
  public _simulateState(state: TerminalConnectionState): void {
    this.setState(state);
  }
}

// Global singleton service
export const terminalWsService = new TerminalWebSocketService();
