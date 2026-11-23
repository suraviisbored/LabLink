# LabLink — Security

## 1. Assets and threats

Assets: accounts and roles, campus data isolation, booking integrity, request data, API keys, audit
log, email channel.

Threats: cross-campus data access, privilege escalation, reading others' data, double-booking races,
injection (SQL, XSS, prompt, email/HTML), key leakage, AI and email abuse, tampering with approvals.

## 2. Controls

| Area | Control | Tier | Where |
|---|---|---|---|
| **Tenant isolation** | `campus_id` on every campus-owned table; RLS `campus_id = current_campus_id()`; repository queries filter by campus; solver/AI/notifications receive same-campus data only | Build | `0002_rls_tenancy.sql`, `src/lib/repo/*` |
| Authentication | Signed httpOnly/SameSite cookie in the demo; Supabase Auth for the hosted path | Build | `src/lib/auth/session.ts` |
| Sign-up restriction | Email domain must match exactly one campus, checked server-side and by a DB trigger; unmapped domains rejected | Build | `handle_new_user`, `src/lib/auth/tenancy.ts` |
| Role integrity | Role lives in `profiles`, defaults to `student`; faculty/admin granted only by admins; client never sends a role; trigger blocks role/campus/email changes | Build | `guard_profile_write`, `/api/v1/admin/faculty` |
| Authorisation | RLS per role plus handler/service role checks | Build | `src/lib/auth/server.ts` |
| Input validation | Zod on every route; unknown fields rejected; length caps | Build | `src/lib/validation/schemas.ts` |
| SQL injection | Parameterised `rpc`/`supabase-js` only; no string-built SQL | Build | migrations |
| XSS / CSRF | React escaping, no `dangerouslySetInnerHTML`, CSP, SameSite cookie, origin check on mutations | Build | `next.config.ts`, `src/lib/api/handler.ts` |
| Secrets | Env vars only; `.env*` ignored; service-role and Gemini keys server-side only | Build | `src/lib/env.ts`, `.gitignore` |
| Headers | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, Permissions-Policy | Build | `next.config.ts` |
| Rate limiting | Per-key token buckets on AI, demo login, auth, mutations and email flush | Build (basic) | `src/lib/rate-limit.ts` |
| Concurrency integrity | Exclusion constraint, advisory locks, version checks, idempotency keys | Build | `0003_functions.sql` |
| Audit | Append-only table; `UPDATE`/`DELETE` privileges revoked; no update policy | Build | `0002_rls_tenancy.sql` |
| Email safety | Recipients from the profile only; static templates; escaped HTML; per-user opt-out; outbox log; demo mail skipped | Build | `src/lib/email/*` |
| Dependencies | Lockfile committed; `npm audit --audit-level=high --omit=dev` in CI | Build | `.github/workflows/ci.yml` |
| Certification checks | Inside `book_slot()`, not only the UI | Specified (enforcement built) | `0003_functions.sql`, `bookSlot` |
| Data retention | Audit logs one academic year, AI prompt logs 30 days | Specified | — |

## 3. AI-specific security

User text is passed in delimited `<data>` blocks and never concatenated into instructions; the system
prompt marks it as untrusted. The AI has no tools and no database access. Output passes Zod
validation, candidate-ID existence checks (same campus) and live feasibility checks before anything
is shown. Only pseudonymous ids and facts (no names, no emails) go to the model. Per-user rate limit,
token cap, 8 s timeout, one retry. Any invalid or unsafe output falls back to the solver. No AI text
is placed in emails. Tests cover malformed JSON, hallucinated ids, provider timeouts and an
instruction-injection explanation — none of them changes booking state.

## 4. Demo mode

The evaluator deployment shows one-click demo accounts on a dedicated **Demo campus**, isolated by the
same tenancy mechanism. Accounts are seeded server-side; no credentials live in the repository.
`DEMO_MODE=false` hides them. Demo-account email is marked `skipped (demo)` and never sent. The demo
campus admin cannot act outside the demo campus (RLS + service checks). The demo-login route is rate
limited.

### 4.1 Postgres adapter and the service-role key

When Supabase is configured the server uses the **service-role key** (`src/lib/db/pg/client.ts`).
That key bypasses RLS, so it is treated like a database password: server-only, never in a
`NEXT_PUBLIC_*` variable, never sent to the browser, never logged. The browser only ever talks to
the Next.js routes, and every repository query leads with `campus_id` from the session, so the
tenant boundary is enforced in the application layer as well as by RLS.

Two consequences worth stating plainly:

- RLS protects anything that reaches PostgREST with a user JWT (for example a future mobile client
  or the Supabase dashboard's table editor), not the server's own writes.
- Adopting Supabase Auth later means storing the user's JWT with the session and using an anon-key
  client per request; the adapter only needs `createDatabaseClient()` to change.

Request flows keep a snapshot per request; a write that loses a race against the exclusion
constraint surfaces as `409 SLOT_TAKEN`, not as a silent overwrite.

## 5. OWASP Top 10 mapping

Broken access control → RLS tenancy + handler checks · Injection → parameterised calls, Zod, CSP,
escaped templates · Cryptographic failures → managed auth, TLS, HMAC-signed session · Insecure design
→ AI advisory only, DB-level invariants · Misconfiguration → headers, env separation, secret review ·
Vulnerable components → `npm audit` in CI · Auth failures → Supabase Auth / signed cookie, rate
limits · Integrity failures → audit log, version checks · Logging failures → structured logs without
PII · SSRF → no user-supplied URLs are fetched.

## 6. Security tests

Implemented in this repository:

- `tests/integration/isolation.test.ts` — cross-campus catalogue/requests/conflict/decision attempts
  are blocked; students cannot run allocation.
- `tests/unit/tenancy.test.ts` — unmapped and malformed domains rejected; duplicate mapping refused.
- `tests/integration/bookings.test.ts` — double booking, quota race, idempotency abuse (another
  user's key), closed-day/after-hours bookings, stale approval decisions.
- `tests/ai/recommend.test.ts` — hallucinated ids, malformed structure, provider failure, injected
  instructions; booking state unchanged.
- `tests/unit/email.test.ts` — `<script>` in a title is escaped; plain-text alternative retained.

Not executed here (needs a live database or browser):

- RLS policy tests for every table, and the exclusion constraint under real concurrency.
- Playwright flows for RBAC and the three E2E journeys.
- `npm audit` (runs in CI).
- Manual keyboard and screen-reader pass.

## 7. Residual risks

- In-memory rate limiting is per serverless instance; a shared store (e.g. Redis) is required for
  global limits.
- Campuses that share one email domain are a documented limitation: the unique domain index rejects
  the second mapping rather than guessing.
- The session cookie is signed, not encrypted; it contains only a user id.
- Without a Supabase project, accounts live in memory and reset when the server restarts; this is a
  demo-only property.
- The adapter's diff-flush is not one transaction across tables: a failure mid-flush can leave the
  earlier tables written. Booking invariants are still safe (the exclusion constraint rejects the
  conflicting row), and `resolve_conflict()`/`book_slot()` are the path to full atomicity.
