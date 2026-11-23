-- =============================================================================
-- LabLink 0004_postgres_adapter.sql
-- Adjustments the application-side Postgres adapter needs.
--
-- 1. Profiles are owned by the app, not by Supabase Auth. The app issues its own
--    signed session cookie (src/lib/auth/session.ts), so profiles.id no longer
--    references auth.users. RLS still keys off auth.uid() for anything that
--    reaches PostgREST with a user JWT; the server adapter uses the service
--    role and scopes every query by campus. See docs/SECURITY.md 4.3.
-- 2. conflict_options keeps the solver strategy and the unallocated request ids
--    in their own columns, so a stored recommendation survives a reload.
-- =============================================================================

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

alter table conflict_options
  add column if not exists strategy text not null default 'fairness';
alter table conflict_options
  add column if not exists unallocated_ids uuid[] not null default '{}';

create index if not exists conflict_options_strategy_idx
  on conflict_options (conflict_id, strategy);

comment on column conflict_options.strategy is
  'Solver strategy that produced the option: fairness | deadline | priority | fcfs | split';
