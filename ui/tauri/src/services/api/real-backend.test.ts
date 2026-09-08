import { describe, it, expect, beforeAll } from "vitest";
import { getToken, getCachedToken, refreshToken, clearToken } from "../auth/token";
import { fetchStatus } from "./status";
import { telemetryCoordinator } from "../../stores/telemetryStore";

describe("Live Real Backend Integration (No Mocks)", () => {
  let isBackendLive = false;

  beforeAll(async () => {
    try {
      const res = await fetch("http://127.0.0.1:5123/config/token", {
        signal: AbortSignal.timeout(500),
      });
      isBackendLive = res.ok;
    } catch {
      isBackendLive = false;
    }
  });

  it("discovers real token from loopback endpoint http://127.0.0.1:5123/config/token", async ({ skip }) => {
    if (!isBackendLive) {
      skip();
      return;
    }
    clearToken();
    const token = await getToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(16);
    expect(getCachedToken()).toBe(token);
  });

  it("successfully performs authenticated request to real GET /status using discovered token", async ({ skip }) => {
    if (!isBackendLive) {
      skip();
      return;
    }
    const status = await fetchStatus();
    expect(status).toBeDefined();
    expect(status.system || status.status).toBeDefined();
  });

  it("handles token refresh cycle against live backend", async ({ skip }) => {
    if (!isBackendLive) {
      skip();
      return;
    }
    const originalToken = await getToken();
    const refreshedToken = await refreshToken();
    expect(refreshedToken).toBe(originalToken); // Token is stable across reads on running instance
  });

  it("exercises telemetry coordinator against real live backend", async ({ skip }) => {
    if (!isBackendLive) {
      skip();
      return;
    }
    telemetryCoordinator.stop();
    await telemetryCoordinator.refreshNow();
    const state = telemetryCoordinator.getState();
    expect(state.connectionState).toBe("CONNECTED");
    expect(state.snapshot).not.toBeNull();
    expect(state.lastUpdated).not.toBeNull();
    expect(state.error).toBeNull();
    telemetryCoordinator.stop();
  });
});
