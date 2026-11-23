import { ok, readJson, withApi } from "@/lib/api/handler";
import { getStore } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { resolveCampusForEmail } from "@/lib/auth/tenancy";
import { encodeSession, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validation/schemas";
import type { Profile } from "@/lib/types";

/**
 * Email-domain tenancy at sign-up (PRD 1.2). With Supabase configured the real
 * sign-up happens in Supabase Auth and the `handle_new_user` trigger performs
 * this same check; this route mirrors it so the rule is demonstrable and tested
 * without a hosted project.
 */
export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    checkRateLimit(`signup:${request.headers.get("host") ?? "local"}`, RATE_LIMITS.auth);
    const { name, email } = await readJson(request, signupSchema);

    const store = getStore();
    const resolution = resolveCampusForEmail(email, store.data.campuses);
    if (!resolution.ok) {
      throw new ApiError(
        "CAMPUS_NOT_SUPPORTED",
        resolution.reason === "invalid_email"
          ? "Enter a valid email address."
          : `${resolution.domain || "That domain"} is not a supported campus domain. Ask your campus admin to add it.`,
      );
    }

    if (store.data.profiles.some((profile) => profile.email.toLowerCase() === email.toLowerCase())) {
      throw new ApiError("VALIDATION_ERROR", "An account with that email already exists.");
    }

    const profile: Profile = {
      id: store.nextId("user"),
      campusId: resolution.campus.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: "student",
      departmentId: null,
      emailNotifications: true,
    };
    store.data.profiles.push(profile);

    const response = ok({
      user: {
        id: profile.id,
        name: profile.name,
        role: profile.role,
        campus: resolution.campus.name,
      },
    });
    response.cookies.set(
      "lablink_session",
      encodeSession({ userId: profile.id, issuedAt: Date.now() }),
      sessionCookieOptions(),
    );
    return response;
  });
}
