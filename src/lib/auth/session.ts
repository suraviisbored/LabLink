import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { Role } from "@/lib/types";

/**
 * Stateless signed session cookie. The payload is not secret (it holds only a
 * user id) but it is signed so it cannot be forged. The profile — role, campus,
 * name — is always re-read from the database, never trusted from the cookie.
 */

export const SESSION_COOKIE = "lablink_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export interface SessionToken {
  userId: string;
  issuedAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function encodeSession(token: SessionToken): string {
  const payload = Buffer.from(JSON.stringify(token)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): SessionToken | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionToken;
    if (!parsed || typeof parsed.userId !== "string" || typeof parsed.issuedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.issuedAt > MAX_AGE_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export interface Session {
  userId: string;
  campusId: string | null;
  campusName: string;
  name: string;
  email: string;
  role: Role;
  emailNotifications: boolean;
}

export function isStaff(role: Role): boolean {
  return role === "faculty" || role === "campus_admin";
}
