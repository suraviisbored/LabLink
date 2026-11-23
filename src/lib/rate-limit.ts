import { ApiError } from "@/lib/errors";

/**
 * Basic in-memory rate limiting (PRD Security 4.2). Deliberately simple: on
 * serverless this is per-instance, which is weaker than a shared store. The
 * docs record that limitation and point at a shared store as the next step.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  ai: { limit: 20, windowMs: 60_000 },
  email: { limit: 40, windowMs: 60_000 },
  demoLogin: { limit: 15, windowMs: 5 * 60_000 },
  auth: { limit: 20, windowMs: 5 * 60_000 },
  mutation: { limit: 120, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.updatedAt > rule.windowMs) {
    buckets.set(key, { tokens: rule.limit - 1, updatedAt: now });
    return;
  }

  if (bucket.tokens <= 0) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }

  bucket.tokens -= 1;
  bucket.updatedAt = now;
}

export function resetRateLimits(): void {
  buckets.clear();
}
