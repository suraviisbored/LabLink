"use client";

/** Tiny typed fetch wrapper for the browser forms. */

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "same-origin",
  });

  if (!response.ok) {
    let code = "VALIDATION_ERROR";
    let message = "Something went wrong. Try again.";
    let details: Record<string, unknown> = {};
    try {
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
      details = payload.error?.details ?? {};
    } catch {
      // keep defaults
    }
    throw new ApiClientError(code, message, details);
  }

  return (await response.json()) as T;
}

export function toIso(value: string): string {
  return new Date(value).toISOString();
}
