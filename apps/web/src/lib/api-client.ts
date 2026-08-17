/**
 * APTLY — Typed API Client
 *
 * Thin fetch wrapper that:
 * - Uses base URL from environment
 * - Forwards X-Request-ID
 * - Parses standard error responses
 * - Provides typed helpers for GET/POST/PUT/DELETE
 */

import type { ErrorResponse } from "@/types/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "" : "http://127.0.0.1:8000");

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorResponse(
  response: Response,
): Promise<ErrorResponse["error"]> {
  try {
    const data = (await response.json()) as ErrorResponse;
    return data.error;
  } catch {
    return {
      code: "UNKNOWN_ERROR",
      message: response.statusText || "An unknown error occurred",
      request_id: response.headers.get("x-request-id") ?? "",
    };
  }
}

import { supabase } from "@/lib/supabase";

interface RequestOptions extends RequestInit {
  requestId?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { requestId, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (requestId) {
    headers.set("X-Request-ID", requestId);
  }

  // Inject Supabase JWT session token if available
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
  } catch {
    // In SSR or unauthenticated state, proceed without token
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new ApiError(
      error.code,
      error.message,
      error.request_id,
      response.status,
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "GET", ...options }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE", ...options }),
};
