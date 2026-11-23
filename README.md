# LabLink

**Every lab, within reach.**

LabLink is a campus-scoped laboratory resource-sharing platform. Students discover specialised
equipment, book unit-level slots, and submit project-based access requests. Faculty approve them.
When approved demand exceeds capacity, a deterministic solver proposes fair, feasible allocations
and an advisory GenAI layer ranks and explains them. A human makes the final decision.

Designed for many campuses; each user sees only their own campus. Cross-campus access is
intentionally out of scope.

---

## Run it (no credentials required)

```bash
npm install
npm run dev        # http://localhost:3000
```

The app boots with a seeded in-memory dataset — **two campuses**, multi-unit equipment, a
ready-made conflict, an approval queue and history that makes the fairness factors differ. No
Supabase project, API key or email account is needed. Times are stored in UTC and rendered in IST.

```bash
npm test           # 61 unit / integration / AI-mock tests (Vitest)
npm run typecheck  # TypeScript strict
npm run lint       # ESLint (next/core-web-vitals)
npm run build      # production build
npm run test:e2e   # Playwright (needs `npx playwright install chromium`)
```

`DEMO_MODE=false` hides the one-click accounts. `APP_SECRET` should be set in a real deployment
(the session cookie is HMAC-signed with it).

### Two-minute tour

1. **Sign in** → *Continue as Student* (Aarav Sharma, Demo campus).
2. **Equipment** → open **NVIDIA Jetson Orin Dev Kit** → pick a slot → book it. The booking appears
   under **Bookings** with check-in and cancel.
3. **My requests** → describe a project and request the Jetson; your faculty guide is notified
   (email + in-app).
4. Sign out, **Continue as Faculty** → **Approvals** → approve, modify or reject with a note.
5. Sign out, **Continue as Campus admin** → **Conflicts** → open the seeded Jetson conflict →
   **Recommend allocations**. You get ranked, feasible options with fairness scores, explanations,
   trade-offs and the winning/losing requests. Apply an option: it re-validates live data, books
   atomically and notifies affected students.
6. Back as the **Student** → open the request → **Why this outcome?** shows the top contributing
   factors with weights and the computed smallest change that would have flipped it
   (“reduce the hours you need from 4 h to 2 h” in the seeded scenario).
7. As **Campus admin**, the **admin** page shows utilisation, the email outbox (demo mail is marked
   `skipped (demo)`), the append-only audit log, policy and fairness weights, and equipment
   management.
8. **Platform admin** sees only campuses and email domains — never campus content.

Demo accounts live on a dedicated demo campus and are isolated by the same tenancy rules. No real
data, and no email leaves the deployment.

---

## Delivery status (honest tiers)

| Feature | Tier | Where |
|---|---|---|
| Campus-scoped tenancy (domain → campus, `campus_id` everywhere) | **Build** | `supabase/migrations/0002_rls_tenancy.sql`, `src/lib/auth/tenancy.ts` |
| Discovery: filters, keyword + NL search | **Build** | `src/lib/services/search.ts`, `src/lib/repo/catalogue.ts`, `src/app/(app)/equipment` |
| Unit-level booking, availability, quota, 409 + alternatives | **Build** | `src/lib/repo/bookings.ts`, `supabase/migrations/0003_functions.sql` |
| Project-based access requests | **Build** | `src/lib/repo/requests.ts`, `src/lib/services/requests.ts` |
| Faculty approval queue with version check | **Build** | `/approvals`, `PATCH /api/v1/requests/:id/decision` |
| Conflict engine (5 solver candidates, AI ranking, validation, fallback) | **Build** | `src/lib/solver/`, `src/lib/ai/`, `/conflicts/:id` |
| N4 counterfactual explanation | **Build** | `src/lib/solver/counterfactual.ts`, `/requests/:id`, `tests/unit/solver.test.ts` |
| Utilisation dashboard | **Build** | `src/lib/repo/admin.ts`, `/admin` |
| Notifications + email outbox + email log | **Build** | `src/lib/repo/notifications.ts`, `src/lib/email/`, `/notifications` |
| Audit log + admin panel | **Build** | `/admin`, `audit_log` (append-only grants) |
| Check-in and no-show auto-release (lazy sweep) | **Stretch 1** | `sweepNoShows`, `check_in_booking`, `/bookings` |
| N2 smart substitution | **Stretch 2** | `src/lib/solver/substitutes.ts`, equipment detail page |
| Waitlist with auto-promotion | **Stretch 3** | `promoteWaitlist`, `/api/v1/waitlist`, `/bookings` |
| N1 project-to-plan, N3 consent swaps, certification records, team projects, recurring bookings | **Specified, not built** | Documented in `docs/PRD.md`; tables exist in the schema, flows do not |
| Cross-campus access | **Out** | Deliberately excluded |

Specified features have schema and acceptance criteria but no UI/API wiring beyond certification
enforcement (`CERT_REQUIRED` inside the booking path). They are labelled in the UI where relevant.

---

## Architecture

```
Browser (student / faculty / campus admin / super admin)
   │ HTTPS
   ▼
Next.js App Router (TypeScript)
   ├─ Server Components ── pages
   ├─ Route handlers /api/v1/*  (auth → Zod → service)
   ├─ Services                 (orchestration, notifications, audit)
   ├─ Repositories             (tenant-scoped data access)
   ├─ Solver (pure TS, no I/O)  ← hard rules, fairness, counterfactuals
   ├─ AIProvider → Gemini       ← ranking and phrasing only
   └─ EmailProvider → outbox    ← post-commit, never rolls back
   │
   ▼
Supabase / Postgres: auth, RLS tenancy, exclusion constraint,
book_slot() / resolve_conflict()
```

Layering is enforced by convention and review: **route → service → repository**. The solver and
the fairness math have no I/O, so they are exhaustively unit tested. The AI cannot write: its output
is schema-validated, candidate-ID-checked, re-validated against live data, and abandoned in favour
of the solver on any failure.

### Concurrency

The database is the final guard. In the SQL path:

- one unit cannot hold overlapping live bookings — GiST exclusion constraint on
  `(unit_id, tstzrange(start_time, end_time))` for `confirmed` / `checked_in`;
- unit selection uses `FOR UPDATE SKIP LOCKED`;
- quota checks take a per-user advisory lock, then recompute;
- retries collapse onto one booking via the unique `idempotency_key`;
- two faculty decisions race on a `version` column (loser: `409 STALE_STATE`);
- conflict application locks the conflict, re-validates every allocation, applies all or nothing;
- the no-show sweep is a conditional update, so it is idempotent.

The in-memory adapter used by the demo mirrors those rules so the API behaves identically; the
tests exercise it (including a 20-way race and a quota-edge race). With Postgres configured, the
same constraints run in the database and a rejected write becomes the same `ApiError`
(`23P01` → `SLOT_TAKEN`).

### Data model

Plain SQL migrations, no ORM: `supabase/migrations/0001_schema.sql` (tables, indexes, constraints),
`0002_rls_tenancy.sql` (helpers, sign-up trigger, policies, append-only grants),
`0003_functions.sql` (`book_slot`, `check_in_booking`, `release_no_shows`, `resolve_conflict`),
`0004_postgres_adapter.sql` (app-owned profiles, stored option strategy).
Every campus-owned table carries `campus_id`; `current_campus_id()` is the single RLS helper.
`supabase/seed.sql` seeds the catalogue, the demo accounts, a faculty approval queue and the
ready-made Jetson conflict for a hosted project.

### Running on Postgres (Supabase)

The adapter in `src/lib/db/pg/` is selected automatically when all three Supabase variables are
set; without them the app keeps using the seeded in-memory store. It loads one snapshot per
request, runs the *unchanged* repository functions over it, and writes the diff back before the
response is sent (`src/lib/db/index.ts`). Ids are UUIDs in Postgres, so `Store.nextId` and the
readable conflict-option ids are generated as UUIDs there.

Against a real project:

```bash
# 1. link the repo to the project (project ref is in the Supabase dashboard URL)
npx supabase login
npx supabase link --project-ref <your-project-ref>

# 2. apply 0001..0004 (or: paste each file into the SQL editor, in order)
npx supabase db push

# 3. seed the demo campus, people, requests and conflict
#    needs the connection string: Project settings → Database → Connection string
psql "$DATABASE_URL" -f supabase/seed.sql

# 4. tell the app to use it (server-only service key; never NEXT_PUBLIC)
#    .env.local
#      NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
#      NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
#      SUPABASE_SERVICE_ROLE_KEY=<service role key>
npm run dev
```

Checks after seeding: the login page lists the demo campus, `student@demo.lablink.example` opens
the catalogue, `/conflicts` shows the Jetson conflict with 14 h of demand, and a booking survives a
server restart (it did not with the in-memory store). Re-running `seed.sql` is safe: every insert
is `on conflict do nothing`, and dates are relative to `now()`.

### API

`/api/v1` — errors are `{ "error": { "code", "message", "details" } }` with codes `SLOT_TAKEN`,
`STALE_STATE`, `QUOTA_EXCEEDED`, `OUTSIDE_AVAILABILITY`, `CERT_REQUIRED`, `SWAP_EXPIRED`,
`FORBIDDEN`, `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION_ERROR`, `CAMPUS_NOT_SUPPORTED`,
`RATE_LIMITED`. Mutations check the request origin and are rate limited. Endpoints are listed in
`docs/ARCHITECTURE.md`.

---

## Evaluation parameters → where to look

| Parameter | Implementation | Evidence / tests |
|---|---|---|
| **Code quality** | TypeScript `strict` + `noUncheckedIndexedAccess`; route → service → repository; shared Zod schemas in `src/lib/validation/schemas.ts`; pure solver; `AIProvider`/`EmailProvider` interfaces; no `any` | `npm run typecheck`, `npm run lint`, `npm run build`; file layout above |
| **Security** | RLS tenancy, sign-up domain trigger, role guards, Zod on every route, CSP + headers, SameSite signed cookie, origin checks, rate limits, parameterised SQL only, append-only audit, escaped email templates, server-only secrets | `supabase/migrations/0002_rls_tenancy.sql`, `next.config.ts`, `src/lib/api/handler.ts`, `src/lib/rate-limit.ts`, `tests/integration/isolation.test.ts`, `tests/unit/email.test.ts` |
| **Efficiency** | Indexes lead with `campus_id`; `(unit_id, start_time, end_time)`, `(user_id, start_time)`; pagination; one-pass utilisation; AI limited to conflicts/search/phrasing, 8 s timeout, one retry, input-hash cache | `supabase/migrations/0001_schema.sql`, `src/lib/ai/gemini.ts`, `src/lib/repo/admin.ts` |
| **Testing** | Unit (fairness, slots, tenancy, solver, counterfactual, email), integration (bookings, quota races, isolation, email outbox), AI with a mocked provider (valid, malformed, hallucinated IDs, throwing), 6 Playwright flows | `tests/`, `playwright.config.ts`, `.github/workflows/ci.yml` |
| **Accessibility** | WCAG AA palette, visible focus, skip link, semantic landmarks, labelled inputs, list alternative to the slot grid, status = icon + text + colour, live regions, 44 px targets, 320 px layout, reduced-motion support | `src/app/globals.css`, `src/components/ui.tsx`, `src/components/forms-booking.tsx` |
| **Problem alignment** | Scope matrix and FR traceability | `docs/PRD.md`, this table |

---

## Configuration

Everything is optional; the app runs without any of it.

| Variable | Purpose |
|---|---|
| `DEMO_MODE` | Show one-click demo accounts (default on) |
| `APP_SECRET` | HMAC key for the session cookie — set in production |
| `APP_ORIGIN` | Absolute base for links in emails |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | All three switch the app to Postgres (`src/lib/db/pg/`); without them the in-memory demo store is used |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; never public |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Enables AI ranking/phrasing; without it the solver fallback is used everywhere |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | `console` (default) or `resend` |
| `DEMO_STUDENT_EMAIL`, `DEMO_FACULTY_EMAIL`, `DEMO_ADMIN_EMAIL` | Demo accounts (demo campus only) |

`.env.example` documents all of them. Secrets are read server-side only (`src/lib/env.ts`); the only
public values are the Supabase anon key placeholders.

---

## Limitations and next steps

- **Postgres path is unexecuted here:** the adapter and its mapping/diff logic are tested against a
  fake PostgREST (`tests/integration/pg-adapter.test.ts`), but no Supabase project or Postgres
  server was available in this environment, so the migrations, the seed and the live HTTP round
  trip have **not** been run. Follow *Running on Postgres* above, then check the four items listed
  there.
- **Snapshot granularity:** each request loads the tables the repositories read and flushes a diff.
  That is deliberate while the repository interface stays synchronous; at larger scale the read
  path should become per-query (`SELECT ... WHERE campus_id = ...`) and multi-table writes should go
  through the SQL functions (`book_slot`, `resolve_conflict`) for single-transaction atomicity.
- **Profiles are app-owned:** `0004` detaches `profiles.id` from `auth.users` because the app issues
  its own session cookie. If you later adopt Supabase Auth, re-point that foreign key and add a
  user-JWT client so RLS is enforced per user rather than by the server adapter.
- **RLS tests** need a live database; the app-layer isolation tests run here, the SQL policies are
  reviewed but not executed by CI.
- **Playwright** is configured and six flows are written; the browser binary is not installed in
  this environment, so the suite was not run (`npm run test:e2e` after
  `npx playwright install chromium`).
- **Rate limiting** is in-memory, so it is per-instance on serverless; a shared store is the next
  step.
- **AI evaluation benchmark** (10+ scripted conflicts vs first-come-first-served) is specified in
  `docs/GENAI.md`; the deterministic fairness metrics are implemented, the side-by-side report is
  not.
- Specified features (N1 plan generator, N3 swaps, team projects, recurring bookings, certification
  records UI) are documented, not built.

---

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product requirements, scope matrix, acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, build order, API
- [`docs/DESIGN.md`](docs/DESIGN.md) — brand, tokens, components, accessibility
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model, controls, tests
- [`docs/GENAI.md`](docs/GENAI.md) — AI boundaries, prompts, guardrails, evaluation
