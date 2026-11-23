# LabLink — Product Requirements Document

## 1. Summary

LabLink is a GenAI-powered, campus-scoped laboratory resource-sharing platform. It serves many
campuses, and each user sees only their own campus's labs. Students discover specialised equipment,
development kits and workstations across departments; book slots; and submit project-based access
requests. Faculty approve them. When requests collide, a solver plus a GenAI layer recommends fair,
feasible allocations from project deadlines, availability and student requirements, and explains
each decision.

**Out of scope:** cross-campus access, payments, procurement, door-access hardware, native apps.

## 2. Roles and tenancy

| Role | Scope | Can do |
|---|---|---|
| Student | Own campus | Search, book, create projects, request access, view own explanations and notifications |
| Faculty | Own campus | Review requests for their projects (granted by a campus admin, never inferred from email) |
| Campus Admin | Own campus | Manage equipment, units, availability, maintenance, quotas, faculty roles, conflicts, utilisation, email log |
| Platform Super Admin | Platform | Add campuses and their email domains, assign the first campus admin. Sees no campus content |

- Each campus has allowed email domains. One domain maps to exactly one campus (unique index
  `campus_email_domains`). A sign-up whose domain matches no campus is rejected.
- Isolation is enforced in the database: every campus-owned table carries `campus_id`, and RLS
  restricts rows to `current_campus_id()`.

## 3. Scope matrix

| Feature | Purpose | Tier |
|---|---|---|
| Campus-scoped tenancy | Designed for all campuses, isolated per campus | Build |
| Equipment discovery, filters, NL search | Equipment discovery | Build |
| Unit-level slot booking with availability, quota | Intelligent slot booking | Build |
| Project-based access requests | Project-based access | Build |
| Faculty approval queue | Faculty approvals | Build |
| Conflict engine (solver + AI ranking + fallback) | Fair, feasible allocations | Build |
| N4 “Why didn’t I get this slot?” | Fairness transparency | Build |
| Utilisation dashboard | Optimise utilisation | Build |
| In-app + email notifications | Approval/conflict awareness | Build |
| Audit log, admin panel | Accountability | Build |
| Check-in and no-show auto-release | Utilisation | Stretch 1 |
| N2 Smart substitution | Alternative allocations | Stretch 2 |
| Waitlist with auto-promotion | Utilisation | Stretch 3 |
| N1 Project-to-plan generator | Project requests | Specified |
| N3 Consent-based slot swaps | Conflict resolution | Specified |
| Certification/safety gating | Safe access to specialised equipment | Specified |
| Team projects | Project-based access | Specified |
| Recurring bookings | Long-running projects | Specified |
| Cross-campus access | Excluded | Out |

## 4. Functional requirements

**FR-1 Discovery (Build).** Campus catalogue: Department → Lab → Equipment → Unit. Keyword search,
filters (department, category, status, availability window), detail page with live availability. NL
search: the AI converts the query into a structured filter; the database returns results; the AI
never returns equipment itself.

**FR-2 Booking (Build).** Select equipment and slot; the system assigns a free unit. Rules: no
double-booking, within lab availability windows, outside maintenance blocks, within the weekly hour
quota (admin-set), cancel/reschedule before the cutoff. A taken slot returns 409 with the 3 nearest
free slots. Times are stored in UTC and shown in IST.

**FR-3 Project Requests (Build).** A student creates a project (title, description, deadline,
faculty guide) and submits a request (equipment, hours, window, justification). Status: Submitted →
Under Review → Approved | Rejected | Modified.

**FR-4 Approvals (Build).** Faculty queue; approve, reject with reason, or approve with changes.
Approved requests carry a priority tier into allocation.

**FR-5 Conflict Engine (Build).**
1. Detect: demand for a unit type exceeds capacity in a window.
2. Solve (deterministic): up to 5 feasible allocations (alternate unit, shifted slot, split hours).
   All hard rules live here.
3. Rank and explain (AI): ranked options with explanations and trade-offs as schema-validated JSON.
4. Validate: schema check, candidate ID check, re-verify feasibility against live data. On failure
   or timeout, fall back to the solver ranking with templated explanations and a visible banner.
5. Decide: a human accepts, edits, or overrides. Applied atomically in the database. Everything is
   logged.

Fairness weights (admin-configurable): deadline proximity 35%, faculty priority 25%, recent usage
20% (less recent use scores higher), hours efficiency 10%, reliability 10% (neutral 1.0 until
no-show data exists).

**FR-6 Utilisation (Build).** Utilisation % per equipment, peak hours, idle assets, conflict count.

**FR-7 Admin (Build).** Equipment and unit CRUD, availability windows, maintenance blocks, quota,
faculty role grants.

**FR-8 Audit (Build).** Append-only log of bookings, decisions, overrides, AI recommendations and
the final choice.

**FR-9 Notifications (Build).**

| Event | In-app | Email |
|---|---|---|
| Request submitted | Faculty guide | Faculty guide |
| Request approved/rejected/modified | Student | Student |
| Conflict detected | Campus admin | No |
| Conflict resolved or booking changed | Affected students | Affected students |
| Booking confirmed/cancelled | Student | No |

Bell with unread count, list, mark read/all read. Users may turn off email (in-app stays on). Email
templates are static, with no AI text. Recipients come only from the user's profile. Every email is
recorded in `email_outbox` (pending/sent/failed/skipped) and visible to campus admins as an Email
log. Sending happens after the DB commit and never rolls back the user's action. Demo-account emails
are marked `skipped (demo)`.

**FR-10 N4 Counterfactual Explanation (Build).** For a request that lost or was moved, show the top
3 contributing factors with weights and the smallest change that would have flipped the outcome. The
change is computed by re-running the solver with perturbed inputs; the AI only rephrases it. No
other user's identity is revealed.

**FR-11 Check-in and No-show Release (Stretch 1).** Check in within a grace period (default 15 min),
else the booking becomes `no_show`, the slot is released and the next waitlisted request is
promoted. Implemented as a lazy sweep run when availability is read. No-shows feed the reliability
factor.

**FR-12 N2 Smart Substitution (Stretch 2).** If equipment is unavailable or a slot is lost, suggest
equivalents available in the same window. Matching is deterministic (same category, normalised spec
comparison, same campus, certification eligibility); the AI only writes the capability-difference
summary; the spec diff is computed.

**FR-13 Waitlist (Stretch 3).** Join a waitlist for a full window; on cancellation or no-show
release, the head entry is promoted once and notified.

**FR-14 – FR-18 (Specified, not built).** N1 project-to-plan generator, N3 consent-based swaps,
certification gating (enforcement exists in `book_slot`; admin records do not), team projects,
recurring bookings. Their tables and acceptance criteria are in the schema and below; no UI ships.

## 5. Non-functional requirements

- **Code quality:** TypeScript strict; ESLint + Prettier; route → service → repository; shared Zod
  schemas; pure solver; provider interfaces; no ORM.
- **Security:** Supabase Auth (hosted path) / signed session (demo); RLS with tenant isolation; Zod on
  every route; parameterised calls; CSP and headers; rate limits; AI has no write access and its
  output is validated; audit log; dependency audit in CI.
- **Efficiency:** indexes on `(unit_id, start_time, end_time)`, `(campus_id, equipment_id)`,
  `(user_id, start_time)`; pagination; no N+1; AI only for conflicts, NL search, plans,
  substitutions and phrasing, 8 s timeout, one retry, input-hash cache. Targets: non-AI API p95 <
  300 ms, page load < 2 s.
- **Testing:** unit (solver, fairness, counterfactual, overlap, quota, domain mapping), integration
  (API rules, RBAC, isolation), concurrency, AI with a mocked LLM, a few Playwright E2E flows, CI.
- **Accessibility:** WCAG 2.1 AA target, listed in `DESIGN.md`.
- **Alignment:** section 3 and this document.

## 6. Concurrency

The database is the final guard. The LLM is never called inside a transaction or while holding a
lock.

| Race | Handling |
|---|---|
| Two students book one slot | GiST exclusion on `(unit_id, tstzrange(...))` for live statuses; `FOR UPDATE SKIP LOCKED`; violation → 409 `SLOT_TAKEN` |
| Double-click / retry | `Idempotency-Key` unique index |
| Quota overspend | Advisory lock per user, then recompute |
| Two faculty decide | `version` column; loser 409 `STALE_STATE` |
| Stale AI recommendation applied | `resolve_conflict()` locks, re-validates on live data, all or nothing |
| No-show sweep vs check-in | Conditional, idempotent update |
| Deadlocks | Retry up to 3× with jitter (hosted path) |

## 7. Data model

See `supabase/migrations/0001_schema.sql`. All times are `timestamptz` (UTC). Tables for Specified
features ship as documented migrations; their flows do not.

## 8. API

See `ARCHITECTURE.md` (section 5) for the endpoint table. Errors:
`{ "error": { "code", "message", "details" } }`.

## 9. Acceptance criteria and test plan

- Booking a taken slot returns 409 `SLOT_TAKEN` plus 3 nearby free slots.
- 20 parallel bookings for one slot → exactly 1 succeeds; parallel bookings at the quota edge never
  exceed the quota; two simultaneous faculty decisions → one succeeds, one 409.
- With the LLM disabled, `/conflicts/:id/recommend` still returns ≥1 valid option with an
  explanation. Malformed AI JSON, timeouts, hallucinated IDs and injection strings never change
  booking state.
- Tenant isolation: a Campus A user cannot read, book or see Campus B equipment, requests, bookings,
  notifications or audit rows; a sign-up from an unmapped domain is rejected.
- A student calling an admin endpoint gets 403; a student cannot read another student's booking.
- Booking outside availability returns `OUTSIDE_AVAILABILITY`.
- Notifications and email behave as in FR-9 (including provider failure and opt-out).
- N4 counterfactual flips the outcome when applied in the solver.
- E2E: search → book; request → approve; conflict → recommend → resolve.

Covered by `tests/` (61 tests). Automated proof for RLS and the exclusion constraint requires a live
Postgres and is documented, not executed here.

## 10. Assumptions, risks, definition of done

**Assumptions:** campus admins enter equipment, availability and faculty roles; one email domain
maps to one campus; the demo deploys on seeded sample data (a demo campus plus a second fictional
campus).

**Risks:** 4-hour scope (tiers and cut line); LLM slow or unavailable (solver fallback); prompt
injection (delimited data, schema validation, no write access); races (DB constraints plus tests);
email delivery restrictions (outbox log); shared-domain campuses (documented limitation).

**Definition of done:** all Build features work end to end; CI green; concurrency, isolation and
AI-mock tests passing; no critical axe violations; no secrets in the repo; `.env.example`;
one-command seed; README with the parameter mapping; seeded demo with two campuses, multi-unit
equipment, a ready-made conflict, and clear labels for Built, Stretch, Specified and Out.
