import type { Campus } from "@/lib/types";

/**
 * Domain → campus mapping. A domain maps to exactly one campus; an unmapped
 * domain is rejected at sign-up (PRD 1.2 / Security 4.2). This pure helper is
 * mirrored by the `handle_new_user` trigger and the unique
 * `campus_email_domains` table, so client code cannot pick its own campus.
 */

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export type CampusResolution =
  | { ok: true; campus: Campus; domain: string }
  | { ok: false; reason: "invalid_email" | "campus_not_supported"; domain: string };

export function resolveCampusForEmail(email: string, campuses: Campus[]): CampusResolution {
  const domain = emailDomain(email);
  if (!isValidEmail(email)) return { ok: false, reason: "invalid_email", domain };

  const matches = campuses.filter(
    (campus) =>
      campus.isActive &&
      campus.allowedEmailDomains.some((allowed) => allowed.toLowerCase() === domain),
  );

  // Defensive: the database enforces uniqueness, so >1 match means bad data and
  // we refuse rather than pick arbitrarily.
  if (matches.length !== 1) {
    return { ok: false, reason: "campus_not_supported", domain };
  }
  return { ok: true, campus: matches[0]!, domain };
}

/** Used by the admin panel to show which campus an address belongs to. */
export function campusForEmail(email: string, campuses: Campus[]): Campus | null {
  const resolution = resolveCampusForEmail(email, campuses);
  return resolution.ok ? resolution.campus : null;
}
