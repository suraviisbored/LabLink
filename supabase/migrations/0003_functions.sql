-- ===========================================================================
-- LabLink 0003_functions.sql
-- Server-side invariants. The LLM is never called from inside these functions
-- and no lock is ever held while waiting on a network call.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function campus_setting_int(p_campus uuid, p_key text, p_default int)
returns int language sql stable as $$
  select coalesce(
    (select (value #>> '{}')::int from settings where campus_id = p_campus and key = p_key),
    p_default
  );
$$;

create or replace function campus_setting_json(p_campus uuid, p_key text, p_default jsonb)
returns jsonb language sql stable as $$
  select coalesce(
    (select value from settings where campus_id = p_campus and key = p_key),
    p_default
  );
$$;

create or replace function write_audit(
  p_campus uuid, p_actor uuid, p_action text, p_entity text, p_entity_id uuid, p_meta jsonb
) returns void language sql security definer set search_path = public as $$
  insert into audit_log (campus_id, actor_id, action, entity, entity_id, metadata_json)
  values (p_campus, p_actor, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- book_slot(): the only write path for bookings.
--   * idempotency key short-circuits retries
--   * advisory lock per user serialises quota checks across tabs
--   * FOR UPDATE SKIP LOCKED picks a free unit without convoying
--   * the gist exclusion constraint is the final backstop
-- ---------------------------------------------------------------------------
create or replace function book_slot(
  p_equipment_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_idempotency_key text,
  p_request_id uuid default null
) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_campus uuid;
  v_tz text;
  v_equipment equipment;
  v_lab labs;
  v_unit uuid;
  v_booking bookings;
  v_duration numeric;
  v_quota int;
  v_used numeric;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication required';
  end if;

  select campus_id into v_campus from profiles where id = v_user;
  if v_campus is null then
    raise exception 'FORBIDDEN: no campus on profile';
  end if;

  -- Retry / double-click: return the booking already created for this key.
  select * into v_booking from bookings where idempotency_key = p_idempotency_key;
  if found then
    if v_booking.user_id <> v_user then
      raise exception 'FORBIDDEN: idempotency key belongs to another user';
    end if;
    return v_booking;
  end if;

  if p_end <= p_start then
    raise exception 'VALIDATION_ERROR: end must be after start';
  end if;

  select * into v_equipment from equipment where id = p_equipment_id;
  if not found or v_equipment.campus_id <> v_campus then
    raise exception 'FORBIDDEN: equipment is not in your campus';
  end if;
  if v_equipment.status <> 'available' then
    raise exception 'OUTSIDE_AVAILABILITY: equipment is not available';
  end if;

  select * into v_lab from labs where id = v_equipment.lab_id;
  select timezone into v_tz from campuses where id = v_campus;

  v_local_start := p_start at time zone v_tz;
  v_local_end := p_end at time zone v_tz;

  if extract(isodow from v_local_start)::smallint <> all (v_lab.available_days) then
    raise exception 'OUTSIDE_AVAILABILITY: lab is closed that day';
  end if;
  if v_local_start::time < v_lab.available_from or v_local_end::time > v_lab.available_to
     or date_trunc('day', v_local_start) <> date_trunc('day', v_local_end) then
    raise exception 'OUTSIDE_AVAILABILITY: outside lab hours %-%', v_lab.available_from, v_lab.available_to;
  end if;

  if exists (
    select 1 from blackouts b
    where b.lab_id = v_lab.id
      and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'OUTSIDE_AVAILABILITY: lab blackout covers this window';
  end if;

  -- Quota: serialise per user, then recompute from committed rows.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_duration := round(extract(epoch from (p_end - p_start)) / 3600.0, 2);
  v_quota := campus_setting_int(v_campus, 'weekly_hours_quota', 10);

  select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600.0), 0)
    into v_used
  from bookings
  where user_id = v_user
    and status in ('confirmed', 'checked_in', 'completed')
    and start_time >= date_trunc('week', p_start at time zone v_tz) at time zone v_tz
    and start_time < (date_trunc('week', p_start at time zone v_tz) + interval '7 days') at time zone v_tz;

  if v_used + v_duration > v_quota then
    raise exception 'QUOTA_EXCEEDED: % of % hours already booked this week', v_used, v_quota;
  end if;

  if v_equipment.requires_certification and not exists (
    select 1 from user_certifications uc
    where uc.user_id = v_user
      and uc.campus_id = v_campus
      and (uc.valid_until is null or uc.valid_until > now())
  ) then
    raise exception 'CERT_REQUIRED: certification needed for %', v_equipment.name;
  end if;

  select u.id into v_unit
  from equipment_units u
  where u.equipment_id = p_equipment_id
    and u.campus_id = v_campus
    and u.status = 'available'
    and not exists (
      select 1 from bookings b
      where b.unit_id = u.id
        and b.status in ('confirmed', 'checked_in')
        and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start, p_end, '[)')
    )
    and not exists (
      select 1 from maintenance_blocks m
      where m.unit_id = u.id
        and tstzrange(m.start_time, m.end_time, '[)') && tstzrange(p_start, p_end, '[)')
    )
  order by u.asset_tag
  for update skip locked
  limit 1;

  if v_unit is null then
    raise exception 'SLOT_TAKEN: no free unit for that window';
  end if;

  begin
    insert into bookings (campus_id, unit_id, user_id, request_id, start_time, end_time, idempotency_key)
    values (v_campus, v_unit, v_user, p_request_id, p_start, p_end, p_idempotency_key)
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN: another booking won the race';
    when unique_violation then
      select * into v_booking from bookings where idempotency_key = p_idempotency_key;
      if found then return v_booking; end if;
      raise;
  end;

  perform write_audit(v_campus, v_user, 'booking.created', 'bookings', v_booking.id,
    jsonb_build_object('unit_id', v_unit, 'start', p_start, 'end', p_end));

  insert into notifications (campus_id, user_id, type, title, body, link)
  values (v_campus, v_user, 'booking_confirmed', 'Booking confirmed',
          'Your booking is confirmed.', '/bookings');

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in (Stretch 1). Only the owner, only while the booking is live.
-- ---------------------------------------------------------------------------
create or replace function check_in_booking(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings;
  v_grace int;
  v_tz text;
begin
  select b.* into v_booking from bookings b where b.id = p_booking_id;
  if not found or v_booking.user_id <> auth.uid() then
    raise exception 'FORBIDDEN: not your booking';
  end if;
  select timezone into v_tz from campuses where id = v_booking.campus_id;
  v_grace := campus_setting_int(v_booking.campus_id, 'grace_minutes', 15);

  update bookings
     set status = 'checked_in', checked_in_at = now(), version = version + 1
   where id = p_booking_id
     and status = 'confirmed'
     and checked_in_at is null
     and now() >= start_time - interval '15 minutes'
     and now() <= start_time + make_interval(mins => v_grace)
  returning * into v_booking;

  if not found then
    raise exception 'VALIDATION_ERROR: check-in window is closed';
  end if;

  perform write_audit(v_booking.campus_id, v_booking.user_id, 'booking.checked_in', 'bookings', v_booking.id, '{}'::jsonb);
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lazy no-show sweep. Called when availability is read; idempotent because
-- the update is conditional on status/checked_in_at.
-- ---------------------------------------------------------------------------
create or replace function release_no_shows(p_campus uuid default null)
returns setof bookings language plpgsql security definer set search_path = public as $$
begin
  return query
  with expired as (
    update bookings b
       set status = 'no_show', version = b.version + 1
     where b.status = 'confirmed'
       and b.checked_in_at is null
       and b.start_time + make_interval(mins => campus_setting_int(b.campus_id, 'grace_minutes', 15)) < now()
       and (p_campus is null or b.campus_id = p_campus)
    returning b.*
  )
  select * from expired;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_conflict(): lock, re-validate against live data, apply all or nothing.
-- ---------------------------------------------------------------------------
create or replace function resolve_conflict(
  p_conflict_id uuid,
  p_option_id uuid,
  p_override_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conflict conflicts;
  v_option conflict_options;
  v_alloc jsonb;
  v_unit uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_request uuid;
  v_user uuid;
  v_resolution uuid;
begin
  if not (is_campus_admin() or current_app_role() = 'faculty') then
    raise exception 'FORBIDDEN: staff only';
  end if;

  select * into v_conflict from conflicts where id = p_conflict_id for update;
  if not found or v_conflict.campus_id <> current_campus_id() then
    raise exception 'FORBIDDEN: conflict is not in your campus';
  end if;
  if v_conflict.status = 'resolved' then
    raise exception 'STALE_STATE: conflict already resolved';
  end if;

  select * into v_option from conflict_options
   where id = p_option_id and conflict_id = p_conflict_id;
  if not found then
    raise exception 'VALIDATION_ERROR: unknown option';
  end if;

  -- Re-verify every allocation on live data before writing anything.
  for v_alloc in select * from jsonb_array_elements(v_option.allocation_json) loop
    v_unit := (v_alloc ->> 'unitId')::uuid;
    v_start := (v_alloc ->> 'startTime')::timestamptz;
    v_end := (v_alloc ->> 'endTime')::timestamptz;

    if not exists (
      select 1 from equipment_units u
      where u.id = v_unit and u.campus_id = v_conflict.campus_id and u.status = 'available'
    ) then
      raise exception 'STALE_STATE: unit % is no longer available', v_unit;
    end if;

    if exists (
      select 1 from bookings b
      where b.unit_id = v_unit
        and b.status in ('confirmed', 'checked_in')
        and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception 'STALE_STATE: unit % is already booked in that window', v_unit;
    end if;

    if exists (
      select 1 from maintenance_blocks m
      where m.unit_id = v_unit
        and tstzrange(m.start_time, m.end_time, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception 'STALE_STATE: unit % is under maintenance', v_unit;
    end if;
  end loop;

  for v_alloc in select * from jsonb_array_elements(v_option.allocation_json) loop
    v_unit := (v_alloc ->> 'unitId')::uuid;
    v_start := (v_alloc ->> 'startTime')::timestamptz;
    v_end := (v_alloc ->> 'endTime')::timestamptz;
    v_request := (v_alloc ->> 'requestId')::uuid;

    select p.student_id into v_user
      from access_requests r join projects p on p.id = r.project_id
     where r.id = v_request and r.campus_id = v_conflict.campus_id;

    if v_user is null then
      raise exception 'VALIDATION_ERROR: unknown request %', v_request;
    end if;

    insert into bookings (campus_id, unit_id, user_id, request_id, start_time, end_time, status, idempotency_key)
    values (v_conflict.campus_id, v_unit, v_user, v_request, v_start, v_end, 'confirmed',
            'conflict:' || p_option_id::text || ':' || v_request::text);

    insert into notifications (campus_id, user_id, type, title, body, link)
    values (v_conflict.campus_id, v_user, 'conflict_resolved', 'Your allocation was updated',
            'A fair allocation was applied to your request.', '/bookings');
  end loop;

  insert into resolutions (conflict_id, campus_id, chosen_option_id, decided_by, override_note)
  values (p_conflict_id, v_conflict.campus_id, p_option_id, auth.uid(), p_override_note)
  returning id into v_resolution;

  update conflicts
     set status = 'resolved', version = version + 1
   where id = p_conflict_id;

  perform write_audit(v_conflict.campus_id, auth.uid(), 'conflict.resolved', 'conflicts',
    p_conflict_id, jsonb_build_object('option_id', p_option_id, 'source', v_option.source));

  return v_resolution;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in points and quota: expose the effective policy to the app shell.
-- ---------------------------------------------------------------------------
create or replace function campus_policy(p_campus uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'weeklyHoursQuota', campus_setting_int(p_campus, 'weekly_hours_quota', 10),
    'cancelCutoffHours', campus_setting_int(p_campus, 'cancel_cutoff_hours', 2),
    'graceMinutes', campus_setting_int(p_campus, 'grace_minutes', 15),
    'fairnessWeights', campus_setting_json(p_campus, 'fairness_weights',
      '{"deadline":0.35,"priority":0.25,"recentUsage":0.20,"hoursEfficiency":0.10,"reliability":0.10}'::jsonb)
  );
$$;
