# LabLink — Architecture

## 1. System overview

```
 Browser (student / faculty / campus admin / super admin)
        │ HTTPS
        ▼
 Next.js App Router (TypeScript)
   ├─ Server Components / pages
   ├─ Route handlers /api/v1/*   (auth → Zod → service)
   ├─ Services                   (rules, notifications, audit, AI orchestration)
   ├─ Repositories               (tenant-scoped reads/writes)
   ├─ Solver (pure TS, no I/O)   → fairness, capacity, counterfactuals
   ├─ AIProvider → Gemini        → ranking and phrasing only
   └─ EmailProvider              → outbox → provider
        │
        ▼
 Supabase / Postgres: Auth, RLS tenancy, exclusion constraint,
 book_slot() / resolve_conflict()
```

## 2. Stack

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind; Postgres/Supabase (Auth, RLS, SQL
migrations, no ORM); Gemini Flash-class model behind `AIProvider`; email behind `EmailProvider`;
Zod; Vitest; Playwright; GitHub Actions.

The running demo uses a seeded in-memory repository so it needs no credentials. When Supabase is
configured, `src/lib/db/pg/` replaces it: one snapshot is loaded per request, the same repository
functions run over it, and the diff is flushed back (see `src/lib/db/index.ts`). Repositories expose
a narrow, campus-scoped interface, so the two adapters share it without touching routes or
pages. See “Limitations” in the README.

## 3. Tenancy

`campuses` holds the allowed email domains; `campus_email_domains` enforces one domain → one campus
with a primary key. A trigger on `auth.users` maps the email domain, sets `profiles.campus_id`, or
rejects the sign-up (`CAMPUS_NOT_SUPPORTED`). `current_campus_id()` is the single RLS helper; every
campus-owned table has a policy `campus_id = current_campus_id()` combined with role rules. Roles
are never accepted from a client payload: a trigger guards `profiles.role`, `campus_id` and `email`.

Application layers also filter by `campus_id` on every read, so a repository bug cannot leak another
campus even if a policy were misconfigured. Both halves are exercised by
`tests/integration/isolation.test.ts`.

## 4. Data flows

- **Booking:** client → `POST /bookings` (Idempotency-Key) → authenticate, validate → availability,
  quota, maintenance → `book_slot()` (advisory lock, free unit `FOR UPDATE SKIP LOCKED`, insert,
  exclusion constraint backstop) → booking or 409 with alternatives → notification.
- **Request and approval:** project + request → faculty decision with a version check → audit →
  notification (+ email via the outbox).
- **Conflict resolution:** detect → solver candidates → Gemini ranks/explanations (no PII) → Zod +
  live feasibility check (fallback on failure) → human decision → `resolve_conflict()` atomic apply →
  notifications + audit.
- **NL search:** query → Gemini returns a structured filter → validated against allowed categories
  and tags → normal campus-scoped query.
- **N4:** solver re-run with perturbed inputs → minimal flipping change → Gemini only phrases it.
- **Email:** DB commit → `flushEmails()` → `EmailProvider.send` → outbox sent/failed. Demo campus →
  `skipped (demo)`. Failure never rolls back the action.
- **Specified flows:** N1 (retrieve campus catalogue candidates → AI selects → validate IDs →
  deterministic schedule from the deadline → plan draft); N3 (propose → both accept → atomic swap);
  recurring series (atomic insert of occurrences).

## 5. API (`/api/v1`)

| Method | Endpoint | Role |
|---|---|---|
| GET | `/equipment`, `/equipment/:id`, `/equipment/:id/availability` | any |
| POST | `/ai/search` | any |
| POST/PATCH | `/equipment`, `/maintenance` | campus_admin |
| POST | `/bookings` (idempotent) | student |
| GET | `/bookings` | any |
| PATCH | `/bookings/:id` (cancel) | owner/admin |
| POST | `/projects`, `/requests` | student |
| GET | `/requests?status=` | faculty/admin |
| PATCH | `/requests/:id/decision` | faculty |
| GET | `/requests/:id/explanation` | owner/guide/admin |
| GET | `/conflicts` | faculty/admin |
| POST | `/conflicts/:id/recommend`, `/conflicts/:id/resolve` | faculty/admin |
| GET | `/analytics/utilisation` | campus_admin |
| GET | `/audit` | campus_admin |
| GET/PATCH/POST | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | any |
| PATCH | `/profile/preferences` | any |
| GET | `/admin/email-log`, `/admin/settings` | campus_admin |
| POST | `/admin/faculty`, `/admin/maintenance` | campus_admin |
| POST/GET | `/campuses` | super_admin |
| POST | `/bookings/:id/check-in` | owner (Stretch 1) |
| GET | `/equipment/:id/substitutes` | any (Stretch 2) |
| POST/DELETE/GET | `/waitlist` | student (Stretch 3) |
| POST | `/auth/demo`, `/auth/logout`, `/auth/signup` | public |

Not implemented (Specified): `/ai/project-plan`, `/swaps`, `/bookings/series`, `/certifications`.

## 6. Project structure

```
lablink/
├─ supabase/migrations/  0001_schema.sql 0002_rls_tenancy.sql 0003_functions.sql
├─ supabase/seed.sql
├─ src/app/              (app)/* pages, api/v1/* route handlers, login, icon.svg
├─ src/components/       app-shell, ui, logo, forms-*
├─ src/lib/
│  ├─ ai/                provider, gemini, schemas, orchestrator
│  ├─ api/               route plumbing (errors, origin, JSON)
│  ├─ auth/              session cookie, tenancy helper, server guards
│  ├─ db/                request-scoped store, in-memory + Postgres adapters
│  ├─ email/             provider, templates, outbox flush
│  ├─ repo/              catalogue, bookings, requests, conflicts, notifications, admin
│  ├─ services/          booking, requests, conflicts, search, substitutes
│  ├─ solver/            fairness, slots, conflict, counterfactual, substitutes
│  └─ validation/        shared Zod schemas
├─ tests/                unit, integration, ai, e2e
├─ docs/                 PRD, ARCHITECTURE, DESIGN, SECURITY, GENAI
└─ .github/workflows/ci.yml
```

## 7. Four-hour build order

| Time | Work |
|---|---|
| 0:00–0:30 | Repo, schema, tenancy, auth + domain mapping |
| 0:30–1:10 | Catalogue, search, availability, seed data (two campuses) |
| 1:10–1:50 | `book_slot()`, booking API/UI, concurrency + isolation tests |
| 1:50–2:30 | Projects, requests, approvals, in-app notifications |
| 2:30–3:20 | Solver, AI ranking + fallback, N4 |
| 3:20–3:45 | Email (outbox + provider), utilisation |
| 3:45–4:00 | Deploy, demo mode, README, docs |

Cut order when behind: Stretch items are never started → utilisation chart (keep the table) → email
beyond the two approval events (keep the outbox) → NL search polish. Never cut tests, tenancy or
accessibility basics.

## 8. Scalability

Stateless serverless functions scale horizontally; `supabase-js` over HTTPS avoids connection
exhaustion; indexes lead with `campus_id`; catalogue reads are cacheable; AI calls are limited and
cached by input hash; email is asynchronous and recorded.

## 9. Future

Build the Specified features; scheduled retries and reminders; digest/push notifications; calendar
sync; demand forecasting; multilingual UI; admin-verified membership for campuses sharing a domain;
dark mode; shared-store rate limiting. Cross-campus access stays out.
