import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NetworkEventsService } from "./networkEvents";
import type { NetworkEvent } from "../../types/contracts";

describe("NetworkEventsService Transport & Event Subscription", () => {
  let service: NetworkEventsService;

  beforeEach(() => {
    service = new NetworkEventsService();
  });

  afterEach(() => {
    service.disconnect();
  });

  it("registers event handlers and dispatches events", () => {
    const handler = vi.fn();
    const unsubscribe = service.onEvent(handler);

    const testEvent: NetworkEvent = {
      event_id: "evt-123",
      sequence: 1,
      state_revision: 5,
      timestamp_epoch_ms: 1700000000000,
      category: "cluster",
      event_type: "node_available",
      severity: "info",
      source_node_id: null,
      target_node_id: "node-1",
      target_device_id: null,
      target_connection_id: null,
      summary: "Node is now available",
      details: {},
    };

    service.dispatchLocalEvent(testEvent);
    expect(handler).toHaveBeenCalledWith(testEvent);

    unsubscribe();
    service.dispatchLocalEvent(testEvent);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("handles bounded-buffer lag notifications", () => {
    const lagHandler = vi.fn();
    const unsubscribe = service.onLag(lagHandler);

    service.dispatchLocalLag(15);
    expect(lagHandler).toHaveBeenCalledWith(15);

    unsubscribe();
    service.dispatchLocalLag(5);
    expect(lagHandler).toHaveBeenCalledTimes(1);
  });

  it("tracks connection state changes and cleanup lifecycle", () => {
    const stateHandler = vi.fn();
    service.onStateChange(stateHandler);

    expect(service.getState()).toBe("disconnected");

    service.disconnect();
    expect(service.getState()).toBe("disconnected");
  });
});
