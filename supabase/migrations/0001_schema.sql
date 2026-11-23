-- ===========================================================================
-- LabLink 0001_schema.sql
-- Core schema. Every campus-owned table carries campus_id (tenancy contract).
-- All timestamps are timestamptz and therefore UTC; the UI renders IST.
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- Tenancy roots
-- ---------------------------------------------------------------------------
create table campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  allowed_email_domains text[] not null default '{}',
  is_demo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint campuses_name_key unique (name)
);

-- One domain maps to exactly one campus. `campuses.allowed_email_domains` is
-- the admin-facing list; this table is the enforced unique index and is kept
-- in sync by `sync_campus_domains()` below.
create table campus_email_domains (
  domain text primary key,
  campus_id uuid not null references campuses (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint campus_email_domains_lowercase check (domain = lower(domain))
);
create index campus_email_domains_campus_idx on campus_email_domains (campus_id);

create or replace function sync_campus_domains() returns trigger
language plpgsql as $$
begin
  delete from campus_email_domains where campus_id = new.id;
  insert into campus_email_domains (domain, campus_id)
  select distinct lower(d), new.id
  from unnest(coalesce(new.allowed_email_domains, '{}')) as d
  where length(trim(d)) > 0;
  return new;
end;
$$;

create trigger campuses_sync_domains
after insert or update of allowed_email_domains on campuses
for each row execute function sync_campus_domains();

create table departments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (campus_id, name)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create type user_role as enum ('student', 'faculty', 'campus_admin', 'super_admin');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  campus_id uuid references campuses (id) on delete restrict,
  name text not null default '',
  email text not null,
  role user_role not null default 'student',
  department_id uuid references departments (id) on delete set null,
  email_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_campus check (
    (role = 'super_admin' and campus_id is null)
    or (role <> 'super_admin' and campus_id is not null)
  )
);
create index profiles_campus_idx on profiles (campus_id, role);
create unique index profiles_email_key on profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table labs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  name text not null,
  location text not null default '',
  available_from time not null default '09:00',
  available_to time not null default '18:00',
  available_days smallint[] not null default '{1,2,3,4,5}',
  created_at timestamptz not null default now()
);
create index labs_campus_idx on labs (campus_id, department_id);

create table blackouts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  lab_id uuid not null references labs (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text not null default '',
  constraint blackouts_range check (end_time > start_time)
);
create index blackouts_lab_idx on blackouts (lab_id, start_time, end_time);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  lab_id uuid not null references labs (id) on delete cascade,
  name text not null,
  category text not null,
  description text not null default '',
  specs_json jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  requires_certification boolean not null default false,
  status text not null default 'available'
    check (status in ('available', 'unavailable', 'retired')),
  created_at timestamptz not null default now()
);
-- Discovery filters and tenant-scoped catalogue reads always lead with campus.
create index equipment_campus_idx on equipment (campus_id, category, status);
create index equipment_lab_idx on equipment (campus_id, lab_id);

create table equipment_units (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete cascade,
  asset_tag text not null,
  status text not null default 'available'
    check (status in ('available', 'maintenance', 'retired')),
  created_at timestamptz not null default now(),
  unique (equipment_id, asset_tag)
);
create index equipment_units_equipment_idx on equipment_units (equipment_id, status);

create table maintenance_blocks (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  unit_id uuid not null references equipment_units (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint maintenance_range check (end_time > start_time)
);
create index maintenance_unit_idx on maintenance_blocks (unit_id, start_time, end_time);

create table certifications (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (campus_id, name)
);

create table user_certifications (
  user_id uuid not null references profiles (id) on delete cascade,
  certification_id uuid not null references certifications (id) on delete cascade,
  campus_id uuid not null references campuses (id) on delete cascade,
  valid_until timestamptz,
  granted_at timestamptz not null default now(),
  primary key (user_id, certification_id)
);

-- ---------------------------------------------------------------------------
-- Projects, requests
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  faculty_id uuid references profiles (id) on delete set null,
  title text not null,
  description text not null default '',
  deadline timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now()
);
create index projects_campus_idx on projects (campus_id, student_id);
create index projects_faculty_idx on projects (campus_id, faculty_id);

create table project_members (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  campus_id uuid not null references campuses (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (project_id, user_id)
);

create type request_status as enum ('submitted', 'under_review', 'approved', 'rejected', 'modified');
create type priority_tier as enum ('low', 'normal', 'high');

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete restrict,
  hours_needed numeric(6, 2) not null check (hours_needed > 0 and hours_needed <= 200),
  window_start timestamptz not null,
  window_end timestamptz not null,
  justification text not null default '',
  status request_status not null default 'submitted',
  priority priority_tier not null default 'normal',
  reviewed_by uuid references profiles (id) on delete set null,
  review_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint access_requests_window check (window_end > window_start)
);
create index access_requests_status_idx on access_requests (campus_id, status, created_at);
create index access_requests_project_idx on access_requests (project_id);
create index access_requests_equipment_idx on access_requests (campus_id, equipment_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create type booking_status as enum ('confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');

create table booking_series (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete cascade,
  rule jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date not null
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  unit_id uuid not null references equipment_units (id) on delete restrict,
  user_id uuid not null references profiles (id) on delete cascade,
  request_id uuid references access_requests (id) on delete set null,
  series_id uuid references booking_series (id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status booking_status not null default 'confirmed',
  checked_in_at timestamptz,
  idempotency_key text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint bookings_range check (end_time > start_time)
);

-- ---------------------------------------------------------------------------
-- Concurrency guard #1: one unit cannot hold two overlapping live bookings.
-- ---------------------------------------------------------------------------
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    unit_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('confirmed', 'checked_in'));

-- Concurrency guard #2: retries and double-clicks collapse onto one booking.
create unique index bookings_idempotency_key on bookings (idempotency_key);

-- Efficiency indexes named in PRD 1.5.
create index bookings_unit_window_idx on bookings (unit_id, start_time, end_time);
create index bookings_user_window_idx on bookings (user_id, start_time desc);
create index bookings_campus_window_idx on bookings (campus_id, start_time);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  desired_start timestamptz not null,
  desired_end timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting', 'promoted', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (equipment_id, user_id, desired_start)
);
create index waitlist_head_idx on waitlist (equipment_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Conflicts and resolutions
-- ---------------------------------------------------------------------------
create type conflict_status as enum ('open', 'recommended', 'resolved');

create table conflicts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  request_ids uuid[] not null default '{}',
  status conflict_status not null default 'open',
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index conflicts_campus_idx on conflicts (campus_id, status);

create table conflict_options (
  id uuid primary key default gen_random_uuid(),
  conflict_id uuid not null references conflicts (id) on delete cascade,
  campus_id uuid not null references campuses (id) on delete cascade,
  allocation_json jsonb not null,
  fairness_score numeric(5, 4) not null default 0,
  explanation text not null default '',
  tradeoffs text not null default '',
  rank integer not null default 1,
  source text not null default 'solver' check (source in ('solver', 'ai')),
  counterfactual_json jsonb,
  created_at timestamptz not null default now()
);
create index conflict_options_conflict_idx on conflict_options (conflict_id, rank);

create table resolutions (
  id uuid primary key default gen_random_uuid(),
  conflict_id uuid not null references conflicts (id) on delete cascade,
  campus_id uuid not null references campuses (id) on delete cascade,
  chosen_option_id uuid not null references conflict_options (id) on delete restrict,
  decided_by uuid not null references profiles (id) on delete restrict,
  override_note text,
  decided_at timestamptz not null default now()
);

create table fairness_ledger (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  event text not null,
  delta numeric(6, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table swap_proposals (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  booking_a_id uuid not null references bookings (id) on delete cascade,
  booking_b_id uuid not null references bookings (id) on delete cascade,
  terms_json jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted_by_a', 'accepted_by_b', 'executed', 'rejected', 'expired', 'invalidated')),
  expires_at timestamptz not null,
  accepted_a_at timestamptz,
  accepted_b_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table plan_drafts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  input_json jsonb not null,
  plan_json jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications, email, settings, audit
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, read, created_at desc);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses (id) on delete cascade,
  notification_id uuid references notifications (id) on delete set null,
  to_user_id uuid not null references profiles (id) on delete cascade,
  subject text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_campus_idx on email_outbox (campus_id, created_at desc);
create index email_outbox_status_idx on email_outbox (status);

create table settings (
  campus_id uuid not null references campuses (id) on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (campus_id, key)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references campuses (id) on delete cascade,
  actor_id uuid references profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_campus_idx on audit_log (campus_id, created_at desc);
