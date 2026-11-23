import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { postgresMode, runWithStore } from "@/lib/db";
import { ApiError } from "@/lib/errors";

/** Shared route plumbing: JSON errors, Zod parsing, origin checks. */

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function failure(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toJSON(), { status: error.status });
  }
  if (error instanceof ZodError) {
    const apiError = new ApiError("VALIDATION_ERROR", "Check the highlighted fields.", {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return NextResponse.json(apiError.toJSON(), { status: 400 });
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Something went wrong on our side. Try again.",
        details: {},
      },
    },
    { status: 500 },
  );
}

export async function withApi(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    // Every route is a write path: Postgres gets a fresh snapshot and the diff
    // is flushed before the response leaves.
    if (postgresMode()) return await runWithStore(handler);
    return await handler();
  } catch (error) {
    return failure(error);
  }
}

export async function readJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Send a JSON body.");
  }
  return schema.parse(payload);
}

/**
 * CSRF defence in depth: the session cookie is SameSite=Lax, and mutations must
 * come from the same origin. Browsers always send Origin on fetch POSTs.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw new ApiError("FORBIDDEN", "Cross-origin request blocked.");
    }
  } catch {
    throw new ApiError("FORBIDDEN", "Invalid origin.");
  }
}
