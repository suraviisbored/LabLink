-- ===========================================================================
-- LabLink 0002_rls_tenancy.sql
-- Tenant isolation lives in the database: every campus-owned table carries
-- campus_id and is restricted to current_campus_id().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function current_campus_id() returns uuid
language sql stable security definer set search_path = public as $$
  select campus_id from profiles where id = auth.uid();
$$;

create or replace function current_app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_campus_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'campus_admin' from profiles where id = auth.uid()), false);
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid()), false);
$$;

-- Faculty "for their projects" is expressed as: faculty on the project, or
-- campus admin. Never inferred from an email address or a client payload.
create or replace function teaches_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = p_project
      and p.campus_id = current_campus_id()
      and p.faculty_id = auth.uid()
  ) or is_campus_admin();
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: map the email domain to exactly one campus, or reject the account.
-- Runs on auth.users so it cannot be bypassed by a client payload.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_domain text := lower(split_part(new.email, '@', 2));
  v_campus uuid;
  v_name text;
begin
  if v_domain = '' then
    raise exception 'CAMPUS_NOT_SUPPORTED: a verified email address is required';
  end if;

  select campus_id into v_campus from campus_email_domains where domain = v_domain;
  if v_campus is null then
    raise exception 'CAMPUS_NOT_SUPPORTED: % is not a supported campus email domain', v_domain;
  end if;

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, campus_id, name, email, role)
  values (new.id, v_campus, v_name, new.email, 'student')
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Role integrity: a client can never send its own role, campus or email.
-- Only a campus admin (or super admin for the first admin) may change them.
-- ---------------------------------------------------------------------------
create or replace function guard_profile_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.role <> old.role or new.campus_id is distinct from old.campus_id
        or new.email <> old.email)
       and not (is_campus_admin() and old.campus_id = current_campus_id())
       and not is_super_admin()
       and auth.uid() is not null
    then
      raise exception 'FORBIDDEN: role, campus and email are managed by admins';
    end if;
    -- Nobody edits another campus's profile.
    if auth.uid() is not null and new.campus_id is distinct from current_campus_id()
       and not is_super_admin() then
      raise exception 'FORBIDDEN: cross-campus profile write';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
before update on profiles
for each row execute function guard_profile_write();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table campuses enable row level security;
alter table campus_email_domains enable row level security;
alter table departments enable row level security;
alter table profiles enable row level security;
alter table labs enable row level security;
alter table blackouts enable row level security;
alter table equipment enable row level security;
alter table equipment_units enable row level security;
alter table maintenance_blocks enable row level security;
alter table certifications enable row level security;
alter table user_certifications enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table access_requests enable row level security;
alter table booking_series enable row level security;
alter table bookings enable row level security;
alter table waitlist enable row level security;
alter table conflicts enable row level security;
alter table conflict_options enable row level security;
alter table resolutions enable row level security;
alter table fairness_ledger enable row level security;
alter table swap_proposals enable row level security;
alter table plan_drafts enable row level security;
alter table notifications enable row level security;
alter table email_outbox enable row level security;
alter table settings enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Campuses: readable for your own campus only. Super admin sees no content
-- (only the campus registry it must administer).
-- ---------------------------------------------------------------------------
create policy campuses_read on campuses for select to authenticated
  using (id = current_campus_id() or is_super_admin());
create policy campuses_write on campuses for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy campus_domains_read on campus_email_domains for select to authenticated
  using (campus_id = current_campus_id() or is_super_admin());
create policy campus_domains_write on campus_email_domains for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------------------------------------------------------------------------
-- Catalogue: read for the campus; write for campus admins only.
-- ---------------------------------------------------------------------------
create policy departments_read on departments for select to authenticated
  using (campus_id = current_campus_id());
create policy departments_write on departments for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy labs_read on labs for select to authenticated
  using (campus_id = current_campus_id());
create policy labs_write on labs for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy equipment_read on equipment for select to authenticated
  using (campus_id = current_campus_id());
create policy equipment_write on equipment for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy units_read on equipment_units for select to authenticated
  using (campus_id = current_campus_id());
create policy units_write on equipment_units for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy blackouts_read on blackouts for select to authenticated
  using (campus_id = current_campus_id());
create policy blackouts_write on blackouts for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy maintenance_read on maintenance_blocks for select to authenticated
  using (campus_id = current_campus_id());
create policy maintenance_write on maintenance_blocks for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy certifications_read on certifications for select to authenticated
  using (campus_id = current_campus_id());
create policy certifications_write on certifications for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy user_certs_own on user_certifications for select to authenticated
  using (user_id = auth.uid() or is_campus_admin());
create policy user_certs_write on user_certifications for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_self_read on profiles for select to authenticated
  using (
    id = auth.uid()
    or (campus_id = current_campus_id() and current_app_role() in ('faculty', 'campus_admin'))
  );
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid() or is_campus_admin())
  with check (id = auth.uid() or is_campus_admin());
create policy profiles_admin_insert on profiles for insert to authenticated
  with check (is_campus_admin() and campus_id = current_campus_id());

-- ---------------------------------------------------------------------------
-- Projects / requests
-- ---------------------------------------------------------------------------
create policy projects_read on projects for select to authenticated
  using (
    campus_id = current_campus_id()
    and (
      student_id = auth.uid()
      or faculty_id = auth.uid()
      or is_campus_admin()
      or exists (select 1 from project_members m where m.project_id = projects.id and m.user_id = auth.uid())
    )
  );
create policy projects_insert on projects for insert to authenticated
  with check (campus_id = current_campus_id() and student_id = auth.uid());
create policy projects_update on projects for update to authenticated
  using (student_id = auth.uid() or is_campus_admin())
  with check (campus_id = current_campus_id());

create policy project_members_read on project_members for select to authenticated
  using (campus_id = current_campus_id() and (user_id = auth.uid() or is_campus_admin()));
create policy project_members_write on project_members for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id());

create policy requests_read on access_requests for select to authenticated
  using (
    campus_id = current_campus_id()
    and (
      is_campus_admin()
      or teaches_project(project_id)
      or exists (
        select 1 from projects p
        where p.id = access_requests.project_id and p.student_id = auth.uid()
      )
      or exists (
        select 1 from project_members m
        where m.project_id = access_requests.project_id and m.user_id = auth.uid()
      )
    )
  );
create policy requests_insert on access_requests for insert to authenticated
  with check (
    campus_id = current_campus_id()
    and exists (
      select 1 from projects p
      where p.id = access_requests.project_id and p.student_id = auth.uid()
    )
  );
create policy requests_faculty_update on access_requests for update to authenticated
  using (campus_id = current_campus_id() and teaches_project(project_id))
  with check (campus_id = current_campus_id());

-- ---------------------------------------------------------------------------
-- Bookings / waitlist
-- ---------------------------------------------------------------------------
create policy bookings_owner_read on bookings for select to authenticated
  using (campus_id = current_campus_id() and (user_id = auth.uid() or is_campus_admin()));
create policy bookings_owner_write on bookings for update to authenticated
  using (campus_id = current_campus_id() and (user_id = auth.uid() or is_campus_admin()))
  with check (campus_id = current_campus_id());
-- Inserts go exclusively through book_slot(); no direct insert policy.

create policy waitlist_own on waitlist for select to authenticated
  using (campus_id = current_campus_id() and (user_id = auth.uid() or is_campus_admin()));
create policy waitlist_write on waitlist for all to authenticated
  using (campus_id = current_campus_id() and user_id = auth.uid())
  with check (campus_id = current_campus_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Conflicts: staff only. A student never sees another student's conflict data;
-- they see their own counterfactual through /requests/:id/explanation.
-- ---------------------------------------------------------------------------
create policy conflicts_staff on conflicts for select to authenticated
  using (campus_id = current_campus_id() and current_app_role() in ('faculty', 'campus_admin'));
create policy conflicts_write on conflicts for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy conflict_options_staff on conflict_options for select to authenticated
  using (campus_id = current_campus_id() and current_app_role() in ('faculty', 'campus_admin'));

create policy resolutions_staff on resolutions for select to authenticated
  using (campus_id = current_campus_id() and current_app_role() in ('faculty', 'campus_admin'));

create policy ledger_own on fairness_ledger for select to authenticated
  using (campus_id = current_campus_id() and (user_id = auth.uid() or is_campus_admin()));

create policy swaps_party on swap_proposals for select to authenticated
  using (
    campus_id = current_campus_id()
    and (
      is_campus_admin()
      or exists (select 1 from bookings b where b.id in (swap_proposals.booking_a_id, swap_proposals.booking_b_id) and b.user_id = auth.uid())
    )
  );

create policy plans_own on plan_drafts for all to authenticated
  using (campus_id = current_campus_id() and user_id = auth.uid())
  with check (campus_id = current_campus_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications / email
-- ---------------------------------------------------------------------------
create policy notifications_own on notifications for select to authenticated
  using (campus_id = current_campus_id() and user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (campus_id = current_campus_id() and user_id = auth.uid())
  with check (campus_id = current_campus_id() and user_id = auth.uid());

create policy email_outbox_admin on email_outbox for select to authenticated
  using (campus_id = current_campus_id() and is_campus_admin());

-- ---------------------------------------------------------------------------
-- Settings / audit
-- ---------------------------------------------------------------------------
create policy settings_read on settings for select to authenticated
  using (campus_id = current_campus_id());
create policy settings_write on settings for all to authenticated
  using (campus_id = current_campus_id() and is_campus_admin())
  with check (campus_id = current_campus_id() and is_campus_admin());

create policy audit_admin_read on audit_log for select to authenticated
  using (campus_id = current_campus_id() and is_campus_admin());

-- Append-only: no UPDATE/DELETE policies exist for any role, and the grants
-- below remove the privilege outright.
revoke update, delete on audit_log from authenticated, anon;
revoke update, delete on email_outbox from authenticated, anon;
grant select, insert on audit_log to authenticated;
grant select on email_outbox to authenticated;
