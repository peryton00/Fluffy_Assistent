/**
 * Fluffy Desktop - Network Events Subscription Service (Phase N7 / N8)
 * 
 * Manages streaming subscription to the canonical Rust NetworkEventBus.
 * Handles event deserialization, subscription lifecycle, and bounded-buffer lag detection.
 * 
 * Transport Boundary Adapter:
 * 1. Tauri Native Events: If running inside Tauri host, attempts listen("network-event").
 * 2. WebSocket: Connects to ws://127.0.0.1:9003/events or custom WebSocket URL if configured.
 * 3. Local/Mock Dispatch: Supports direct dispatch for testing & in-process bridge.
 * 
 * Zero Emojis, Zero N9+ functionality.
 */

import type { NetworkEvent } from "../../types/contracts";

export type NetworkEventHandler = (event: NetworkEvent) => void;
export type NetworkLagHandler = (droppedCount: number) => void;
export type NetworkConnectionState = "connected" | "connecting" | "disconnected";
export type NetworkStateChangeHandler = (state: NetworkConnectionState) => void;

export class NetworkEventsService {
  private socket: WebSocket | null = null;
  private tauriUnlisten: (() => void) | null = null;
  private connectionState: NetworkConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventListeners = new Set<NetworkEventHandler>();
  private lagListeners = new Set<NetworkLagHandler>();
  private stateListeners = new Set<NetworkStateChangeHandler>();
  private url: string;
  private shouldAutoReconnect: boolean = true;

  constructor(url = "ws://127.0.0.1:9003/events") {
    this.url = url;
  }

  public getState(): NetworkConnectionState {
    return this.connectionState;
  }

  public onEvent(handler: NetworkEventHandler): () => void {
    this.eventListeners.add(handler);
    return () => {
      this.eventListeners.delete(handler);
    };
  }

  public onLag(handler: NetworkLagHandler): () => void {
    this.lagListeners.add(handler);
    return () => {
      this.lagListeners.delete(handler);
    };
  }

  public onStateChange(handler: NetworkStateChangeHandler): () => void {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  private setConnectionState(nextState: NetworkConnectionState): void {
    if (this.connectionState === nextState) return;
    this.connectionState = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(nextState);
      } catch (err) {
        console.error("[NetworkEventsService] Error in state listener:", err);
      }
    }
  }

  private isTauriEnvironment(): boolean {
    if (typeof window === "undefined") return false;
    return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
  }

  public async connect(): Promise<void> {
    if (this.connectionState === "connected" || this.connectionState === "connecting") {
      return;
    }

    this.setConnectionState("connecting");

    // 1. Attempt Tauri Native Event Subscription if in Tauri
    if (this.isTauriEnvironment()) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<NetworkEvent | { lagged?: number; lag?: number }>(
          "network-event",
          (event) => {
            const payload = event.payload;
            if (payload && typeof payload === "object") {
              if ("lagged" in payload || "lag" in payload) {
                const dropped = Number((payload as { lagged?: number; lag?: number }).lagged ?? (payload as { lagged?: number; lag?: number }).lag ?? 1);
                this.dispatchLocalLag(dropped);
                return;
              }
              if ("event_id" in payload && "category" in payload) {
                this.dispatchLocalEvent(payload as NetworkEvent);
              }
            }
          }
        );
        this.tauriUnlisten = unlisten;
        this.setConnectionState("connected");
        return;
      } catch {
        // Fall back to WebSocket
      }
    }

    // 2. WebSocket Subscription
    if (typeof WebSocket === "undefined") {
      // Non-browser or test environment without WebSocket global
      this.setConnectionState("disconnected");
      return;
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.setConnectionState("connected");
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          
          // Check for lag notification from bounded ring buffer
          if (parsed && typeof parsed === "object" && ("lagged" in parsed || "lag" in parsed)) {
            const dropped = Number(parsed.lagged ?? parsed.lag ?? 1);
            this.dispatchLocalLag(dropped);
            return;
          }

          // Canonical NetworkEvent dispatch
          if (parsed && parsed.event_id && parsed.category && parsed.event_type) {
            this.dispatchLocalEvent(parsed as NetworkEvent);
          }
        } catch (err) {
          console.warn("[NetworkEventsService] Failed to parse message:", err);
        }
      };

      this.socket.onerror = () => {
        // Handled in onclose
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.setConnectionState("disconnected");
        if (this.shouldAutoReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.setConnectionState("disconnected");
      if (this.shouldAutoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.shouldAutoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.tauriUnlisten) {
      try {
        this.tauriUnlisten();
      } catch {
        // Safe ignore
      }
      this.tauriUnlisten = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Safe ignore
      }
      this.socket = null;
    }
    this.setConnectionState("disconnected");
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  /**
   * Dispatches an event directly to local listeners (used for testing & local bridges).
   */
  public dispatchLocalEvent(event: NetworkEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[NetworkEventsService] Error in event listener:", err);
      }
    }
  }

  /**
   * Dispatches a lag notification directly to local listeners.
   */
  public dispatchLocalLag(droppedCount: number): void {
    for (const listener of this.lagListeners) {
      try {
        listener(droppedCount);
      } catch (err) {
        console.error("[NetworkEventsService] Error in lag listener:", err);
      }
    }
  }
}

export const networkEventsService = new NetworkEventsService();
