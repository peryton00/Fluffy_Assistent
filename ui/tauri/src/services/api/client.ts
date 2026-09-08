/**
 * Fluffy Desktop - Typed API Client
 * 
 * Central HTTP client abstraction interacting with the Python Brain Web API.
 * Automatically injects X-Fluffy-Token, manages retries on 401/403, and normalizes errors.
 */

import { getToken, refreshToken, clearToken } from "../auth/token";

export type ApiErrorCode =
  | "AUTHENTICATION_FAILED"
  | "BACKEND_UNAVAILABLE"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "PARSING_ERROR"
  | "CANCELLED";

export class ApiClientError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status?: number;
  public readonly endpoint: string;
  public readonly details?: unknown;

  constructor(message: string, code: ApiErrorCode, endpoint: string, status?: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.endpoint = endpoint;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl !== undefined ? baseUrl : "http://127.0.0.1:5123";
  }

  public getBaseUrl(): string {
    return this.baseUrl || "http://127.0.0.1:5123";
  }

  private resolveUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return this.baseUrl ? `${this.baseUrl}${cleanPath}` : cleanPath;
  }

  /**
   * Core request execution pipeline with timeout, auth token injection, and retry.
   */
  public async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options: RequestOptions = {},
    isRetry = false
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const timeoutMs = options.timeoutMs ?? 5000;

    // Setup combined abort controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If caller provided external abort signal, listen to it
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...options.headers,
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      if (!options.skipAuth && path !== "/config/token") {
        try {
          const token = await getToken(isRetry);
          headers["X-Fluffy-Token"] = token;
        } catch (err) {
          throw new ApiClientError(
            `Failed to acquire authentication token: ${err instanceof Error ? err.message : String(err)}`,
            "AUTHENTICATION_FAILED",
            path
          );
        }
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      // Handle Authentication Failure (401 or 403)
      if ((response.status === 401 || response.status === 403) && !isRetry && !options.skipAuth) {
        clearToken();
        await refreshToken();
        return this.request<T>(method, path, body, options, true);
      }

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }

        const isAuthError = response.status === 401 || response.status === 403;
        throw new ApiClientError(
          `HTTP ${response.status} on ${method} ${path}`,
          isAuthError ? "AUTHENTICATION_FAILED" : "HTTP_ERROR",
          path,
          response.status,
          errorData
        );
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      try {
        const data = await response.json();
        return data as T;
      } catch (err) {
        throw new ApiClientError(
          `Failed to parse JSON response from ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
          "PARSING_ERROR",
          path,
          response.status
        );
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        throw err;
      }

      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new ApiClientError(`Request to ${method} ${path} was cancelled`, "CANCELLED", path);
        }
        throw new ApiClientError(`Request to ${method} ${path} timed out after ${timeoutMs}ms`, "TIMEOUT", path);
      }

      // Network unreachable / connection refused
      throw new ApiClientError(
        `Backend service unavailable at ${url} (${err instanceof Error ? err.message : String(err)})`,
        "BACKEND_UNAVAILABLE",
        path
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  public post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  public put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  public delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, body, options);
  }
}

// Default singleton instance
export const apiClient = new ApiClient();
