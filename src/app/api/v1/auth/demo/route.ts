import { ok, readJson, withApi } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { getStore } from "@/lib/db/store";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { demoLoginSchema } from "@/lib/validation/schemas";

/**
 * Evaluator access (Security 4.4). Only available when DEMO_MODE is on, only
 * for accounts on the demo campus, and rate limited. Credentials are never in
 * the repo; the demo accounts are seeded on a campus isolated by the same RLS.
 */
export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    if (!env.demoMode) {
      throw new ApiError("FORBIDDEN", "Demo mode is off on this deployment.");
    }

    checkRateLimit(`demo-login:${request.headers.get("host") ?? "local"}`, RATE_LIMITS.demoLogin);
    const { role } = await readJson(request, demoLoginSchema);

    const store = getStore();
    const demoCampus = store.data.campuses.find((campus) => campus.isDemo);
    if (!demoCampus) throw new ApiError("NOT_FOUND", "No demo campus is configured.");

    const emailByRole: Record<string, string> = {
      student: env.demoEmails.student,
      faculty: env.demoEmails.faculty,
      campus_admin: env.demoEmails.admin,
    };

    const profile =
      role === "super_admin"
        ? store.data.profiles.find((entry) => entry.role === "super_admin")
        : store.data.profiles.find(
            (entry) =>
              entry.campusId === demoCampus.id &&
              entry.role === role &&
              entry.email === emailByRole[role],
          );

    if (!profile) {
      throw new ApiError("NOT_FOUND", "That demo account is not seeded.");
    }

    const response = ok({
      user: { id: profile.id, name: profile.name, role: profile.role, campus: demoCampus.name },
    });
    response.cookies.set(
      "lablink_session",
      encodeSession({ userId: profile.id, issuedAt: Date.now() }),
      sessionCookieOptions(),
    );
    return response;
  });
}
