/**
 * Fluffy Desktop - Auth Token Service
 * 
 * Manages discovery, memory caching, and invalidation of the X-Fluffy-Token.
 * Discovers token from the backend loopback endpoint: GET /config/token
 * 
 * Strict rule: Token is never committed, hardcoded, or stored insecurely.
 */

import type { TokenResponse } from "../../types/contracts";

let cachedToken: string | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

const BACKEND_BASE_URL = "http://127.0.0.1:5123";

/**
 * Returns the loopback endpoint URL for token discovery.
 */
function getTokenEndpoint(): string {
  return `${BACKEND_BASE_URL}/config/token`;
}

/**
 * Fetches token from loopback backend with timeout and deduplication.
 */
async function fetchTokenFromLoopback(): Promise<string> {
  const endpoint = getTokenEndpoint();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Token discovery failed with status ${res.status}`);
    }

    const data: TokenResponse = await res.json();
    if (!data || typeof data.token !== "string" || !data.token) {
      throw new Error("Invalid token payload returned from backend");
    }

    cachedToken = data.token;
    return cachedToken;
  } finally {
    clearTimeout(timeoutId);
    inFlightTokenPromise = null;
  }
}

/**
 * Retrieves the active X-Fluffy-Token.
 * Returns cached token if present, otherwise discovers token from loopback.
 * Deduplicates concurrent calls to prevent thundering herd.
 */
export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }

  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = fetchTokenFromLoopback();
  return inFlightTokenPromise;
}

/**
 * Invalidate cached token and force immediate rediscovery.
 */
export async function refreshToken(): Promise<string> {
  cachedToken = null;
  return getToken(true);
}

/**
 * Clears the cached token (e.g. on authentication error).
 */
export function clearToken(): void {
  cachedToken = null;
}

/**
 * Returns currently cached token synchronously (or null).
 */
export function getCachedToken(): string | null {
  return cachedToken;
}

/**
 * Sets token directly (primarily for testing).
 */
export function setCachedTokenForTesting(token: string | null): void {
  cachedToken = token;
}
