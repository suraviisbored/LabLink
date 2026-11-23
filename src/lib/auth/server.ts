import { cookies } from "next/headers";
import { loadStore } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import {
  SESSION_COOKIE,
  decodeSession,
  isStaff,
  type Session,
} from "@/lib/auth/session";
import type { Role } from "@/lib/types";

/**
 * Server-side session resolution. Role and campus always come from the stored
 * profile, so a stale or edited cookie can never escalate privileges.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!token) return null;

  // Pages call this before rendering; loadStore() reads Postgres when it is
  // configured and the seeded demo otherwise.
  const store = await loadStore();
  const profile = store.data.profiles.find((entry) => entry.id === token.userId);
  if (!profile) return null;

  const campus = profile.campusId
    ? store.data.campuses.find((entry) => entry.id === profile.campusId)
    : undefined;
  if (profile.campusId && !campus) return null;
  if (campus && !campus.isActive) return null;

  return {
    userId: profile.id,
    campusId: profile.campusId,
    campusName: campus?.name ?? "Platform",
    name: profile.name,
    email: profile.email,
    role: profile.role,
    emailNotifications: profile.emailNotifications,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  return session;
}

export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new ApiError("FORBIDDEN", "You do not have permission to do that.");
  }
  return session;
}

export async function requireCampus(): Promise<Session & { campusId: string }> {
  const session = await requireSession();
  if (!session.campusId) {
    throw new ApiError("FORBIDDEN", "This action needs a campus account.");
  }
  return { ...session, campusId: session.campusId };
}

export function staffOnly(session: Session): boolean {
  return isStaff(session.role) || session.role === "campus_admin";
}
