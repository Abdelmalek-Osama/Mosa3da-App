-- =============================================================================
-- Mosa3da — Migration 0002: Queue Engine RPCs
--
-- Every queue mutation runs inside ONE transaction that first locks the
-- clinic_sessions row (SELECT ... FOR UPDATE). Concurrent staff actions on the
-- same day are therefore serialized; the partial unique indexes from 0001 are the
-- last line of defense (never two Current / Ready).
--
-- Projection (authoritative, mirrored in src/server/domain/queue/projection.ts):
--   anchor = Current exists ? max(current.started_at + current.duration, now())
--                           : max(session.opens_at, now())
--   ExpectedStart(1) = anchor
--   ExpectedStart(N) = ExpectedStart(N-1) + Duration(N-1)
--   Eligible = ready | arrived | late, not absent (missed_turn_at is null),
--   ordered by (status = ready) desc, position, created_at, id.
--   A running consultation therefore pushes everyone back by its remaining time,
--   and an overrunning one anchors the queue at "now".
--
-- Custom SQLSTATEs (mapped in src/lib/errors/postgres.ts):
--   MQ403 forbidden · MQ404 not found · MQ409 invalid transition / conflict
--   MQ412 stale version · MQ422 validation
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Internal helpers (not callable by API roles)
-- -----------------------------------------------------------------------------

-- Returns the acting staff user id. Trusted server contexts (service role JWT or
-- a direct database connection) are allowed and return NULL (= system actor).
create or replace function public._require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
begin
  if public.is_staff() then
    return auth.uid();
  end if;

  if v_jwt_role = 'service_role' or (v_jwt_role is null and session_user <> 'authenticator') then
    return null;
  end if;

  raise exception 'Only active clinic staff can manage the queue' using errcode = 'MQ403';
end;
$$;

create or replace function public._clinic_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.doctor_settings where id = 1), 'Africa/Cairo')
$$;

-- Creates (if needed) and LOCKS the session for p_date. Also materializes
-- Scheduled queue entries for that day's booked appointments.
create or replace function public._ensure_session(p_date date, p_allow_closed_day boolean default true)
returns public.clinic_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session  public.clinic_sessions;
  v_start    time;
  v_end      time;
  v_opens    timestamptz;
  v_closes   timestamptz;
begin
  select * into v_session from public.clinic_sessions where clinic_date = p_date for update;

  if v_session.id is null then
    select min(start_time), max(end_time) into v_start, v_end
    from public.clinic_working_days
    where is_active and weekday = extract(dow from p_date)::smallint;

    if v_start is null then
      if not p_allow_closed_day then
        raise exception 'The clinic is not open on %', p_date using errcode = 'MQ409';
      end if;
      -- Unscheduled day (e.g. emergency opening): start now, 4h window.
      v_opens  := greatest(now(), public.clinic_local_to_utc(p_date, time '00:00'));
      v_closes := v_opens + interval '4 hours';
    else
      v_opens  := public.clinic_local_to_utc(p_date, v_start);
      v_closes := public.clinic_local_to_utc(p_date, v_end);
    end if;

    insert into public.clinic_sessions (clinic_date, opens_at, closes_at, status)
    values (p_date, v_opens, v_closes, 'open')
    on conflict (clinic_date) do nothing;

    select * into v_session from public.clinic_sessions where clinic_date = p_date for update;
  end if;

  if v_session.status = 'closed' then
    raise exception 'The clinic session for % is closed', p_date using errcode = 'MQ409';
  end if;

  -- Booked appointments of the day appear as Scheduled (no number / position).
  insert into public.queue_entries
    (session_id, clinic_date, patient_id, appointment_id, visit_reason,
     estimated_duration_minutes, expected_start_at, status)
  select v_session.id, v_session.clinic_date, a.patient_id, a.id, a.visit_reason,
         a.duration_minutes, a.scheduled_start, 'scheduled'
  from public.appointments a
  where a.clinic_date = p_date
    and a.status = 'scheduled'
    and not exists (select 1 from public.queue_entries q where q.appointment_id = a.id)
    and not exists (
      select 1 from public.queue_entries q
      where q.session_id = v_session.id and q.patient_id = a.patient_id
        and q.status not in ('finished', 'cancelled')
    );

  return v_session;
end;
$$;

-- Locks and returns the session that owns an entry, plus the entry itself.
create or replace function public._lock_entry(p_entry_id uuid, p_expected_version integer)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_entry      public.queue_entries;
begin
  select session_id into v_session_id from public.queue_entries where id = p_entry_id;
  if v_session_id is null then
    raise exception 'Queue entry not found' using errcode = 'MQ404';
  end if;

  -- Lock order: session first, then entry. Prevents deadlocks between actions.
  perform 1 from public.clinic_sessions where id = v_session_id for update;
  select * into v_entry from public.queue_entries where id = p_entry_id for update;

  if p_expected_version is not null and v_entry.version <> p_expected_version then
    raise exception 'This patient was updated by someone else. Refresh and try again.'
      using errcode = 'MQ412';
  end if;

  return v_entry;
end;
$$;

create or replace function public._next_position(p_session_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select coalesce(max(position), 0) + 1 from public.queue_entries where session_id = p_session_id
$$;

create or replace function public._take_queue_number(p_session_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.clinic_sessions
  set next_queue_number = next_queue_number + 1
  where id = p_session_id
  returning next_queue_number - 1
$$;

-- Promotes the first eligible patient to Ready when no Ready patient exists.
create or replace function public._maintain_ready(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  if exists (select 1 from public.queue_entries where session_id = p_session_id and status = 'ready') then
    return;
  end if;

  select id into v_next
  from public.queue_entries
  where session_id = p_session_id
    and status in ('arrived', 'late')
    and missed_turn_at is null
  order by position, created_at, id
  limit 1;

  if v_next is not null then
    update public.queue_entries
    set status = 'ready', ready_at = now()
    where id = v_next;
  end if;
end;
$$;

-- Applies the late policy after a consultation finished. Returns rows moved.
create or replace function public._apply_late_policy(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_needed  integer := coalesce((select late_policy_consultations from public.doctor_settings where id = 1), 2);
  v_moved   integer := 0;
  r         record;
begin
  select finished_consultations_count into v_count from public.clinic_sessions where id = p_session_id;

  for r in
    select id, missed_turn_baseline
    from public.queue_entries
    where session_id = p_session_id
      and missed_turn_at is not null
      and status = 'arrived'
      and v_count >= missed_turn_baseline + v_needed
    order by missed_turn_at, id
  loop
    update public.queue_entries
    set status               = 'late',
        late_at              = now(),
        position             = public._next_position(p_session_id),
        missed_turn_at       = null,
        missed_turn_baseline = null
    where id = r.id;

    insert into public.queue_status_history
      (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason, metadata)
    values
      (r.id, p_session_id, 'late_policy_applied', 'arrived', 'late', null,
       'Still absent after ' || v_needed || ' subsequent consultations',
       jsonb_build_object('baseline', r.missed_turn_baseline, 'finished_count', v_count));

    v_moved := v_moved + 1;
  end loop;

  return v_moved;
end;
$$;

-- Recomputes expected_start_at for the whole session (see header).
create or replace function public._recalculate_queue(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opens   timestamptz;
  v_current public.queue_entries;
  v_cursor  timestamptz;
  r         record;
begin
  select opens_at into v_opens from public.clinic_sessions where id = p_session_id;
  select * into v_current from public.queue_entries where session_id = p_session_id and status = 'current';

  if v_current.id is not null then
    if v_current.expected_start_at is distinct from v_current.started_at then
      update public.queue_entries set expected_start_at = v_current.started_at where id = v_current.id;
    end if;
    v_cursor := greatest(
      v_current.started_at + make_interval(mins => v_current.estimated_duration_minutes),
      now()
    );
  else
    v_cursor := greatest(v_opens, now());
  end if;

  for r in
    select id, estimated_duration_minutes, expected_start_at
    from public.queue_entries
    where session_id = p_session_id
      and status in ('ready', 'arrived', 'late')
      and missed_turn_at is null
    order by (status = 'ready') desc, position, created_at, id
  loop
    if r.expected_start_at is distinct from v_cursor then
      update public.queue_entries set expected_start_at = v_cursor where id = r.id;
    end if;
    v_cursor := v_cursor + make_interval(mins => r.estimated_duration_minutes);
  end loop;

  -- Absent patients have no projection until they return.
  update public.queue_entries
  set expected_start_at = null
  where session_id = p_session_id
    and missed_turn_at is not null
    and expected_start_at is not null;
end;
$$;

create or replace function public._finalize(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._maintain_ready(p_session_id);
  perform public._recalculate_queue(p_session_id);
end;
$$;

-- Checks in a Scheduled entry: assigns number + end-of-queue position.
create or replace function public._check_in_entry(p_entry public.queue_entries)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.queue_entries
  set status       = 'arrived',
      arrived_at   = now(),
      queue_number = public._take_queue_number(p_entry.session_id),
      position     = public._next_position(p_entry.session_id)
  where id = p_entry.id;

  update public.appointments
  set status = 'checked_in', checked_in_at = now()
  where id = p_entry.appointment_id and status = 'scheduled';
end;
$$;

-- =============================================================================
-- PUBLIC RPCs (staff)
-- =============================================================================

-- Opens / syncs today's session. Idempotent; call when loading the queue page.
create or replace function public.open_clinic_session(p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.clinic_sessions;
begin
  perform public._require_staff();
  v_session := public._ensure_session(coalesce(p_date, public.clinic_today()));
  perform public._finalize(v_session.id);
  return v_session.id;
end;
$$;

-- Walk-in registration: patient (find or create) → appointment → queue entry.
create or replace function public.register_walk_in(
  p_full_name             text,
  p_phone                 text,
  p_visit_reason          public.visit_reason,
  p_visit_reason_details  text    default null,
  p_duration_minutes      integer default null,
  p_notes                 text    default null,
  p_patient_id            uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := public._require_staff();
  v_today       date := public.clinic_today();
  v_session     public.clinic_sessions;
  v_patient_id  uuid := p_patient_id;
  v_phone       text;
  v_duration    integer;
  v_appt_id     uuid;
  v_entry       public.queue_entries;
  v_created     boolean := false;
begin
  perform set_config('mosa3da.actor_id', coalesce(v_actor::text, ''), true);

  v_duration := coalesce(
    p_duration_minutes,
    (select default_consultation_minutes from public.doctor_settings where id = 1),
    20
  );
  if v_duration not between 5 and 180 then
    raise exception 'Duration must be between 5 and 180 minutes' using errcode = 'MQ422';
  end if;

  -- 1. Patient
  if v_patient_id is null then
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'Enter a valid phone number' using errcode = 'MQ422';
    end if;
    if p_full_name is null or char_length(btrim(p_full_name)) < 2 then
      raise exception 'Enter the patient''s full name' using errcode = 'MQ422';
    end if;

    select id into v_patient_id from public.patients where normalized_phone = v_phone;
    if v_patient_id is null then
      insert into public.patients (full_name, normalized_phone, created_by)
      values (p_full_name, v_phone, v_actor)
      returning id into v_patient_id;
      v_created := true;
    end if;
  elsif not exists (select 1 from public.patients where id = v_patient_id and is_active) then
    raise exception 'Patient not found' using errcode = 'MQ404';
  end if;

  -- 2. Session (locked; also materializes today's Scheduled entries)
  v_session := public._ensure_session(v_today);

  -- 3. Already booked today? Check that booking in instead of duplicating.
  select * into v_entry
  from public.queue_entries
  where session_id = v_session.id and patient_id = v_patient_id
    and status not in ('finished', 'cancelled')
  for update;

  if v_entry.id is not null then
    if v_entry.status <> 'scheduled' then
      raise exception 'This patient is already in today''s queue (#%)', v_entry.queue_number
        using errcode = 'MQ409';
    end if;
    perform public._check_in_entry(v_entry);
    select * into v_entry from public.queue_entries where id = v_entry.id;
  else
    insert into public.appointments
      (patient_id, clinic_date, duration_minutes, visit_reason, visit_reason_details,
       patient_notes, status, source, booked_by, checked_in_at)
    values
      (v_patient_id, v_today, v_duration, p_visit_reason, nullif(btrim(p_visit_reason_details), ''),
       nullif(btrim(p_notes), ''), 'checked_in', 'walk_in', v_actor, now())
    returning id into v_appt_id;

    insert into public.queue_entries
      (session_id, clinic_date, patient_id, appointment_id, queue_number, position,
       visit_reason, estimated_duration_minutes, status, arrived_at, staff_notes, created_by)
    values
      (v_session.id, v_session.clinic_date, v_patient_id, v_appt_id,
       public._take_queue_number(v_session.id), public._next_position(v_session.id),
       p_visit_reason, v_duration, 'arrived', now(), nullif(btrim(p_notes), ''), v_actor)
    returning * into v_entry;
  end if;

  perform public._finalize(v_session.id);
  select * into v_entry from public.queue_entries where id = v_entry.id;

  return jsonb_build_object(
    'queue_entry_id',    v_entry.id,
    'patient_id',        v_patient_id,
    'patient_created',   v_created,
    'queue_number',      v_entry.queue_number,
    'status',            v_entry.status,
    'expected_start_at', v_entry.expected_start_at
  );
end;
$$;

-- Single entry point for status transitions.
--   p_action: mark_arrived | mark_ready | mark_absent | start_consultation |
--             finish_consultation | mark_late | cancel
create or replace function public.queue_transition(
  p_entry_id          uuid,
  p_action            text,
  p_expected_version  integer default null,
  p_reason            text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := public._require_staff();
  v_entry    public.queue_entries;
  v_count    integer;
  v_late     integer := 0;
begin
  perform set_config('mosa3da.actor_id', coalesce(v_actor::text, ''), true);
  perform set_config('mosa3da.reason', coalesce(left(p_reason, 500), ''), true);

  v_entry := public._lock_entry(p_entry_id, p_expected_version);

  if v_entry.status in ('finished', 'cancelled') then
    raise exception 'This visit is already %', v_entry.status using errcode = 'MQ409';
  end if;

  case p_action
    -- Scheduled → Arrived (check-in), or absent patient returned (cancels late policy).
    when 'mark_arrived' then
      if v_entry.status = 'scheduled' then
        perform public._check_in_entry(v_entry);
      elsif v_entry.missed_turn_at is not null then
        update public.queue_entries
        set missed_turn_at = null, missed_turn_baseline = null, arrived_at = now()
        where id = v_entry.id;

        insert into public.queue_status_history
          (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason)
        values
          (v_entry.id, v_entry.session_id, 'late_policy_cancelled', v_entry.status, v_entry.status,
           v_actor, 'Patient returned before the late policy completed');
      else
        raise exception 'Patient is already checked in' using errcode = 'MQ409';
      end if;

    -- Manually choose who is next. The previous Ready patient goes back to waiting.
    when 'mark_ready' then
      if v_entry.status not in ('arrived', 'late') or v_entry.missed_turn_at is not null then
        raise exception 'Only a waiting patient who is present can be marked ready' using errcode = 'MQ409';
      end if;
      update public.queue_entries
      set status = 'arrived'
      where session_id = v_entry.session_id and status = 'ready';
      update public.queue_entries
      set status = 'ready', ready_at = now()
      where id = v_entry.id;

    -- Ready but absent: record the missed turn and snapshot the finish counter.
    when 'mark_absent' then
      if v_entry.status <> 'ready' then
        raise exception 'Only the Ready patient can be marked absent' using errcode = 'MQ409';
      end if;
      select finished_consultations_count into v_count
      from public.clinic_sessions where id = v_entry.session_id;

      update public.queue_entries
      set status = 'arrived', missed_turn_at = now(), missed_turn_baseline = v_count
      where id = v_entry.id;

      insert into public.queue_status_history
        (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason, metadata)
      values
        (v_entry.id, v_entry.session_id, 'missed_turn', 'ready', 'arrived', v_actor,
         coalesce(p_reason, 'Patient absent when called'),
         jsonb_build_object('baseline', v_count));

    -- Explicit staff confirmation starts a consultation.
    when 'start_consultation' then
      if exists (select 1 from public.queue_entries
                 where session_id = v_entry.session_id and status = 'current') then
        raise exception 'Finish the current consultation first' using errcode = 'MQ409';
      end if;
      if v_entry.status not in ('ready', 'arrived', 'late') or v_entry.missed_turn_at is not null then
        raise exception 'This patient cannot start a consultation now' using errcode = 'MQ409';
      end if;

      update public.queue_entries
      set status = 'current', started_at = now()
      where id = v_entry.id;

      update public.clinic_sessions
      set actual_started_at = coalesce(actual_started_at, now())
      where id = v_entry.session_id;

    -- Current → Finished. Does NOT auto-start the next patient.
    when 'finish_consultation' then
      if v_entry.status <> 'current' then
        raise exception 'Only the current consultation can be finished' using errcode = 'MQ409';
      end if;

      update public.queue_entries
      set status = 'finished', finished_at = now()
      where id = v_entry.id;

      update public.appointments
      set status = 'completed', completed_at = now()
      where id = v_entry.appointment_id and status in ('scheduled', 'checked_in');

      update public.clinic_sessions
      set finished_consultations_count = finished_consultations_count + 1
      where id = v_entry.session_id;

      v_late := public._apply_late_policy(v_entry.session_id);

    -- Manual late: move to the end of the eligible queue.
    when 'mark_late' then
      if v_entry.status not in ('arrived', 'ready') then
        raise exception 'Only a waiting patient can be marked late' using errcode = 'MQ409';
      end if;
      update public.queue_entries
      set status               = 'late',
          late_at              = now(),
          position             = public._next_position(v_entry.session_id),
          missed_turn_at       = null,
          missed_turn_baseline = null
      where id = v_entry.id;

    when 'cancel' then
      if v_entry.status = 'current' then
        raise exception 'Finish the consultation instead of cancelling it' using errcode = 'MQ409';
      end if;
      update public.queue_entries
      set status = 'cancelled', cancelled_at = now(),
          missed_turn_at = null, missed_turn_baseline = null
      where id = v_entry.id;

      update public.appointments
      set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
          cancellation_reason = left(p_reason, 500)
      where id = v_entry.appointment_id and status in ('scheduled', 'checked_in');

    else
      raise exception 'Unknown queue action: %', p_action using errcode = 'MQ422';
  end case;

  perform public._finalize(v_entry.session_id);
  select * into v_entry from public.queue_entries where id = p_entry_id;

  return jsonb_build_object(
    'queue_entry_id',    v_entry.id,
    'status',            v_entry.status,
    'version',           v_entry.version,
    'expected_start_at', v_entry.expected_start_at,
    'late_transitions',  v_late
  );
end;
$$;

-- Moves an active entry to a 1-based slot among the eligible waiting entries.
create or replace function public.reorder_queue_entry(
  p_entry_id          uuid,
  p_new_index         integer,
  p_expected_version  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := public._require_staff();
  v_entry     public.queue_entries;
  v_ids       uuid[];
  v_positions integer[];
  v_index     integer;
begin
  perform set_config('mosa3da.actor_id', coalesce(v_actor::text, ''), true);
  v_entry := public._lock_entry(p_entry_id, p_expected_version);

  if v_entry.status not in ('arrived', 'ready', 'late') then
    raise exception 'Only waiting patients can be reordered' using errcode = 'MQ409';
  end if;

  select array_agg(id order by position, created_at, id),
         array_agg(position order by position)
  into v_ids, v_positions
  from public.queue_entries
  where session_id = v_entry.session_id and status in ('arrived', 'ready', 'late');

  v_index := least(greatest(coalesce(p_new_index, 1), 1), array_length(v_ids, 1));
  v_ids   := array_remove(v_ids, v_entry.id);
  v_ids   := v_ids[1:v_index - 1] || v_entry.id || v_ids[v_index:];

  -- Reuse the same set of position values; the unique key is deferred.
  update public.queue_entries q
  set position = v_positions[o.ord]
  from unnest(v_ids) with ordinality as o(id, ord)
  where q.id = o.id and q.position is distinct from v_positions[o.ord];

  insert into public.queue_status_history
    (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, metadata)
  values
    (v_entry.id, v_entry.session_id, 'reordered', v_entry.status, v_entry.status, v_actor,
     jsonb_build_object('from_position', v_entry.position, 'to_index', v_index));

  -- The manual order wins over the old Ready selection.
  update public.queue_entries
  set status = 'arrived'
  where session_id = v_entry.session_id and status = 'ready';

  perform public._finalize(v_entry.session_id);
  select * into v_entry from public.queue_entries where id = p_entry_id;

  return jsonb_build_object('queue_entry_id', v_entry.id, 'position', v_entry.position,
                            'version', v_entry.version, 'expected_start_at', v_entry.expected_start_at);
end;
$$;

create or replace function public.update_queue_entry_duration(
  p_entry_id          uuid,
  p_duration_minutes  integer,
  p_expected_version  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._require_staff();
  v_entry public.queue_entries;
begin
  perform set_config('mosa3da.actor_id', coalesce(v_actor::text, ''), true);
  if p_duration_minutes not between 5 and 180 then
    raise exception 'Duration must be between 5 and 180 minutes' using errcode = 'MQ422';
  end if;

  v_entry := public._lock_entry(p_entry_id, p_expected_version);
  if v_entry.status in ('finished', 'cancelled') then
    raise exception 'This visit is already %', v_entry.status using errcode = 'MQ409';
  end if;

  update public.queue_entries set estimated_duration_minutes = p_duration_minutes where id = v_entry.id;
  update public.appointments  set duration_minutes = p_duration_minutes where id = v_entry.appointment_id;

  perform public._finalize(v_entry.session_id);
  select * into v_entry from public.queue_entries where id = p_entry_id;

  return jsonb_build_object('queue_entry_id', v_entry.id, 'version', v_entry.version,
                            'expected_start_at', v_entry.expected_start_at);
end;
$$;

-- =============================================================================
-- READ RPCs
-- =============================================================================

-- Patient: own status only. Never exposes other patients.
create or replace function public.get_my_queue_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid := public.current_patient_id();
  v_entry      public.queue_entries;
  v_ahead      integer;
  v_wait       integer;
begin
  if v_patient_id is null then
    raise exception 'Patient account required' using errcode = 'MQ403';
  end if;

  select q.* into v_entry
  from public.queue_entries q
  where q.patient_id = v_patient_id
    and q.clinic_date = public.clinic_today()
  order by (q.status in ('finished', 'cancelled')), q.created_at desc
  limit 1;

  if v_entry.id is null then
    return jsonb_build_object('in_queue', false);
  end if;

  if v_entry.status in ('ready', 'arrived', 'late') and v_entry.missed_turn_at is null then
    select count(*) into v_ahead
    from public.queue_entries q
    where q.session_id = v_entry.session_id
      and q.missed_turn_at is null
      and (
        q.status = 'current'
        or (q.status in ('ready', 'arrived', 'late') and q.expected_start_at < v_entry.expected_start_at)
      );
  end if;

  if v_entry.expected_start_at is not null then
    v_wait := greatest(0, ceil(extract(epoch from (v_entry.expected_start_at - now())) / 60))::integer;
  end if;

  return jsonb_build_object(
    'in_queue',           true,
    'queue_number',       v_entry.queue_number,
    'status',             v_entry.status,
    'missed_turn',        v_entry.missed_turn_at is not null,
    'patients_ahead',     v_ahead,
    'expected_start_at',  v_entry.expected_start_at,
    'estimated_wait_minutes', v_wait,
    'visit_reason',       v_entry.visit_reason
  );
end;
$$;

-- Public waiting-room board. Returns ONLY approved display fields:
-- queue number, masked first name + initial, status label, expected time.
create or replace function public.get_display_board()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.clinic_sessions where clinic_date = public.clinic_today()
  ),
  q as (
    select qe.queue_number, qe.status, qe.expected_start_at, qe.started_at,
           public.mask_patient_name(p.full_name) as display_name,
           qe.position, qe.created_at, qe.id
    from public.queue_entries qe
    join s on s.id = qe.session_id
    join public.patients p on p.id = qe.patient_id
    where qe.status in ('current', 'ready', 'arrived', 'late')
      and qe.missed_turn_at is null
  )
  select jsonb_build_object(
    'clinic', (select jsonb_build_object(
                 'name', ds.clinic_name, 'name_ar', ds.clinic_name_ar,
                 'doctor', ds.doctor_display_name, 'timezone', ds.timezone)
               from public.doctor_settings ds where ds.id = 1),
    'session_open', exists (select 1 from s where s.status = 'open'),
    'current', (select jsonb_build_object('queue_number', queue_number, 'display_name', display_name,
                                          'started_at', started_at)
                from q where status = 'current'),
    'next',    (select jsonb_build_object('queue_number', queue_number, 'display_name', display_name,
                                          'expected_start_at', expected_start_at)
                from q where status = 'ready'),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object(
                           'queue_number', queue_number, 'display_name', display_name,
                           'expected_start_at', expected_start_at,
                           'is_late', status = 'late')
                         order by expected_start_at nulls last, position, created_at, id)
                         from q where status in ('arrived', 'late')), '[]'::jsonb),
    'generated_at', now()
  );
$$;

-- =============================================================================
-- NOTIFICATIONS (service role only)
-- Inserts one pending message per queue entry whose expected start falls within
-- the threshold. idempotency_key makes repeated cron runs safe.
-- =============================================================================
create or replace function public.enqueue_due_notifications()
returns setof public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold integer := coalesce((select whatsapp_threshold_minutes from public.doctor_settings where id = 1), 30);
  v_tz        text    := public._clinic_timezone();
begin
  return query
  insert into public.notification_logs
    (idempotency_key, queue_entry_id, appointment_id, patient_id, channel, template_key,
     recipient_phone, message_body, status, expected_start_at, threshold_minutes)
  select
    'consultation_approaching:' || q.id,
    q.id, q.appointment_id, q.patient_id, 'whatsapp_simulated', 'consultation_approaching',
    p.normalized_phone,
    format('Hello %s, your consultation is approaching. Your expected consultation time is %s. Please proceed to the clinic.',
           split_part(p.full_name, ' ', 1),
           to_char(q.expected_start_at at time zone v_tz, 'HH24:MI')),
    'pending', q.expected_start_at, v_threshold
  from public.queue_entries q
  join public.patients p on p.id = q.patient_id
  where q.clinic_date = public.clinic_today()
    and q.status in ('arrived', 'ready', 'late')
    and q.missed_turn_at is null
    and q.expected_start_at is not null
    and q.expected_start_at <= now() + make_interval(mins => v_threshold)
  on conflict (idempotency_key) do nothing
  returning *;
end;
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._require_staff()',
    'public._clinic_timezone()',
    'public._ensure_session(date, boolean)',
    'public._lock_entry(uuid, integer)',
    'public._next_position(uuid)',
    'public._take_queue_number(uuid)',
    'public._maintain_ready(uuid)',
    'public._apply_late_policy(uuid)',
    'public._recalculate_queue(uuid)',
    'public._finalize(uuid)',
    'public._check_in_entry(public.queue_entries)',
    'public.enqueue_due_notifications()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.open_clinic_session(date)',
    'public.register_walk_in(text, text, public.visit_reason, text, integer, text, uuid)',
    'public.queue_transition(uuid, text, integer, text)',
    'public.reorder_queue_entry(uuid, integer, integer)',
    'public.update_queue_entry_duration(uuid, integer, integer)',
    'public.get_my_queue_status()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

grant execute on function public.get_display_board() to anon, authenticated;

commit;
