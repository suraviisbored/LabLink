/**
 * API error vocabulary (PRD 1.8). Every route returns
 * `{ error: { code, message, details } }` and services throw `ApiError`.
 */

export const ERROR_CODES = [
  "SLOT_TAKEN",
  "STALE_STATE",
  "QUOTA_EXCEEDED",
  "OUTSIDE_AVAILABILITY",
  "CERT_REQUIRED",
  "SWAP_EXPIRED",
  "FORBIDDEN",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CAMPUS_NOT_SUPPORTED",
  "RATE_LIMITED",
  "CONFLICT",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  SLOT_TAKEN: 409,
  STALE_STATE: 409,
  QUOTA_EXCEEDED: 409,
  OUTSIDE_AVAILABILITY: 400,
  CERT_REQUIRED: 403,
  SWAP_EXPIRED: 409,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CAMPUS_NOT_SUPPORTED: 403,
  RATE_LIMITED: 429,
  CONFLICT: 409,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    status?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status ?? STATUS[code];
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Maps a Postgres error message raised by the migrations to an ApiError. */
export function fromDatabaseError(error: unknown): ApiError {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "Unknown database error");

  const code = ERROR_CODES.find((candidate) => message.startsWith(candidate));
  if (code) {
    const detail = message.includes(":")
      ? message.slice(message.indexOf(":") + 1).trim()
      : message;
    return new ApiError(code, detail);
  }
  return new ApiError("VALIDATION_ERROR", "The request could not be completed.");
}
