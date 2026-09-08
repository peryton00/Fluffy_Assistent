import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiClient, ApiClientError } from "./client";
import { setCachedTokenForTesting, clearToken } from "../auth/token";

describe("ApiClient", () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient("http://127.0.0.1:5123");
    clearToken();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("injects X-Fluffy-Token header into requests when token is available", async () => {
    setCachedTokenForTesting("test-secret-token-123");

    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options?.headers;
      return new Response(JSON.stringify({ status: "active" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await client.get<{ status: string }>("/status");
    expect(result.status).toBe("active");
    expect((capturedHeaders as Record<string, string>)["X-Fluffy-Token"]).toBe("test-secret-token-123");
  });

  it("fetches token from loopback when no cached token exists", async () => {
    clearToken();

    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes("/config/token")) {
        return new Response(JSON.stringify({ token: "discovered-loopback-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await client.get<{ ok: boolean }>("/status");
    expect(result.ok).toBe(true);
  });

  it("automatically refreshes token and retries request on 401 response", async () => {
    setCachedTokenForTesting("expired-token");

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes("/config/token")) {
        return new Response(JSON.stringify({ token: "refreshed-token-999" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await client.get<{ success: boolean }>("/test-endpoint");
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it("normalizes HTTP errors into typed ApiClientError with HTTP_ERROR code", async () => {
    setCachedTokenForTesting("valid-token");

    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 })
    );

    await expect(client.get("/failing-route")).rejects.toThrowError(ApiClientError);
    try {
      await client.get("/failing-route");
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("HTTP_ERROR");
      expect(apiErr.status).toBe(500);
    }
  });

  it("handles backend unavailable state and network connection failures", async () => {
    setCachedTokenForTesting("valid-token");

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await client.get("/status");
      expect.unreachable("Should have thrown");
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("BACKEND_UNAVAILABLE");
    }
  });

  it("handles request timeouts cleanly", async () => {
    setCachedTokenForTesting("valid-token");

    globalThis.fetch = vi.fn().mockImplementation(
      (_url, options) =>
        new Promise((_, reject) => {
          const signal = options?.signal as AbortSignal;
          signal?.addEventListener("abort", () => {
            const abortErr = new Error("The operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        })
    );

    try {
      await client.get("/slow-route", { timeoutMs: 50 });
      expect.unreachable("Should have timed out");
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("TIMEOUT");
    }
  });

  it("handles external AbortSignal cancellation with CANCELLED code", async () => {
    setCachedTokenForTesting("valid-token");

    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, options) =>
        new Promise((_, reject) => {
          const signal = options?.signal as AbortSignal;
          if (signal?.aborted) {
            const abortErr = new Error("The operation was aborted");
            abortErr.name = "AbortError";
            return reject(abortErr);
          }
          signal?.addEventListener("abort", () => {
            const abortErr = new Error("The operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        })
    );

    const promise = client.get("/abort-route", { signal: controller.signal });
    controller.abort();

    try {
      await promise;
      expect.unreachable("Should have aborted");
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("CANCELLED");
    }
  });

  it("deduplicates concurrent token discovery requests into a single in-flight network call", async () => {
    clearToken();

    let tokenFetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes("/config/token")) {
        tokenFetchCount++;
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({ token: "concurrent-token-42" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    // Launch 10 concurrent requests
    const promises = Array.from({ length: 10 }, () => client.get("/parallel-endpoint"));
    await Promise.all(promises);

    expect(tokenFetchCount).toBe(1);
  });
});
