-- =============================================================================
-- Migration 0020: Smart Clinics features, round 2 (2026-11-08)
--
-- 1. Booked visitors keep their place ahead of walk-ins who came early.
--    * A booked visitor who is present goes before walk-ins as soon as serving
--      the next walk-in first would make her miss her booked time.
--    * When the next patient is called and a booked visitor whose time has come
--      is not in the clinic yet, she is shifted (appointments.grace_shifts + 1).
--      Two shifts are a grace period; the third time she is passed she becomes
--      Delayed (appointments.delayed_at) and loses her priority: when she checks
--      in she joins the end of the queue as Late.
--    * A Ready patient picked by staff (mark_ready) is never replaced. A Ready
--      patient the system picked is replaced only by a booked visitor whose time
--      has come (queue_entries.ready_pinned tells the two apart).
--    * get_display_board shows Shifted / Delayed on the lobby screen.
-- 2. Staff book and reschedule by day only: the system gives the earliest free
--    time (same packing as the visitors' day booking).
-- 3. doctor_settings.show_fees_to_all: show the fees pop-up after every online
--    booking instead of the first one only.
-- 4. Visit feedback: one 1-5 star rating (or a dismissal) per finished visit,
--    asked on the visitor's next visit to her dashboard. The doctor reads them.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Booked-visitor priority with a grace period
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists grace_shifts smallint not null default 0,
  add column if not exists delayed_at   timestamptz;

alter table public.appointments drop constraint if exists appointments_grace_shifts_range;
alter table public.appointments
  add constraint appointments_grace_shifts_range check (grace_shifts between 0 and 10);

alter table public.queue_entries
  add column if not exists ready_pinned boolean not null default false;

-- Number of times a booked visitor may be passed before she becomes Delayed.
create or replace function public._booking_grace_limit()
returns integer
language sql
immutable
as $$ select 2 $$;

-- ready_pinned = Ready chosen by staff. _maintain_ready flags its own picks
-- with the transaction setting mosa3da.auto_ready = 'on'.
create or replace function public.queue_entries_ready_pin()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    new.ready_pinned := coalesce(current_setting('mosa3da.auto_ready', true), '') <> 'on';
  elsif new.status <> 'ready' then
    new.ready_pinned := false;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_entries_ready_pin on public.queue_entries;
create trigger queue_entries_ready_pin
  before update of status on public.queue_entries
  for each row execute function public.queue_entries_ready_pin();

-- Start of the next consultation: end of the current one, or the opening time.
create or replace function public._queue_anchor(p_session_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select greatest(q.started_at + make_interval(mins => q.estimated_duration_minutes), now())
       from public.queue_entries q where q.session_id = p_session_id and q.status = 'current' limit 1),
    greatest((select s.opens_at from public.clinic_sessions s where s.id = p_session_id), now())
  )
$$;

-- Puts present patients in consultation order and returns the Ready entry to
-- demote, if any (a system-picked Ready that a due booked visitor replaces).
--   W = walk-ins, Late patients and Delayed visitors, in their current order.
--   B = booked visitors who are present and not Delayed, by booked time.
-- At each step B's first visitor goes next when serving W's first patient
-- before her would start her after her booked time; otherwise W goes first.
-- The existing position numbers are reused, so the deferred unique key holds.
create or replace function public._sequence_waiting(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t         timestamptz := public._queue_anchor(p_session_id);
  v_ready     record;
  v_demote    uuid;
  v_w         uuid[];
  v_wdur      integer[];
  v_b         uuid[];
  v_bat       timestamptz[];
  v_bdur      integer[];
  v_order     uuid[] := '{}';
  v_positions integer[];
  v_nw        integer;
  v_nb        integer;
  i           integer := 1;
  j           integer := 1;
begin
  select q.id, q.ready_pinned, q.estimated_duration_minutes as dur,
         (a.scheduled_start is not null and a.delayed_at is null) as booked
  into v_ready
  from public.queue_entries q
  left join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id and q.status = 'ready'
  limit 1;

  select array_agg(a.scheduled_start order by a.scheduled_start, q.position, q.id),
         array_agg(q.id order by a.scheduled_start, q.position, q.id),
         array_agg(q.estimated_duration_minutes order by a.scheduled_start, q.position, q.id)
  into v_bat, v_b, v_bdur
  from public.queue_entries q
  join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id
    and q.status = 'arrived'
    and q.missed_turn_at is null
    and a.scheduled_start is not null
    and a.delayed_at is null;

  v_nb := coalesce(array_length(v_b, 1), 0);

  -- Keep the Ready patient unless she was picked by the system, is not booked,
  -- and a present booked visitor would otherwise start after her booked time.
  if v_ready.id is not null then
    if v_ready.ready_pinned or v_ready.booked
       or v_nb = 0 or v_bat[1] >= v_t + make_interval(mins => v_ready.dur) then
      v_t := v_t + make_interval(mins => v_ready.dur);
    else
      v_demote := v_ready.id;
    end if;
  end if;

  select array_agg(q.id order by q.position, q.created_at, q.id),
         array_agg(q.estimated_duration_minutes order by q.position, q.created_at, q.id)
  into v_w, v_wdur
  from public.queue_entries q
  left join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id
    and q.missed_turn_at is null
    and (q.status = 'late'
         or (q.status = 'arrived' and (a.scheduled_start is null or a.delayed_at is not null))
         or q.id = v_demote);

  v_nw := coalesce(array_length(v_w, 1), 0);
  if v_nw + v_nb < 2 and v_demote is null then
    return null;
  end if;

  while i <= v_nw or j <= v_nb loop
    if j <= v_nb and (i > v_nw or v_bat[j] < v_t + make_interval(mins => v_wdur[i])) then
      v_order := v_order || v_b[j];
      v_t := v_t + make_interval(mins => v_bdur[j]);
      j := j + 1;
    else
      v_order := v_order || v_w[i];
      v_t := v_t + make_interval(mins => v_wdur[i]);
      i := i + 1;
    end if;
  end loop;

  select array_agg(q.position order by q.position)
  into v_positions
  from public.queue_entries q
  where q.id = any (v_order);

  update public.queue_entries q
  set position = v_positions[o.ord]
  from unnest(v_order) with ordinality as o(id, ord)
  where q.id = o.id and q.position is distinct from v_positions[o.ord];

  return v_demote;
end;
$$;

-- Keeps exactly one Ready patient, in priority order (see header), and counts
-- the booked visitors who are passed because they are not in the clinic.
create or replace function public._maintain_ready(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_demote uuid;
  v_next   uuid;
  v_next_at timestamptz;
  v_call_at timestamptz;
  v_date   date;
  r        record;
begin
  v_demote := public._sequence_waiting(p_session_id);

  if v_demote is not null then
    update public.queue_entries set status = 'arrived' where id = v_demote and status = 'ready';
  elsif exists (select 1 from public.queue_entries where session_id = p_session_id and status = 'ready') then
    return;
  end if;

  select q.id, a.scheduled_start into v_next, v_next_at
  from public.queue_entries q
  left join public.appointments a on a.id = q.appointment_id and a.delayed_at is null and q.status <> 'late'
  where q.session_id = p_session_id
    and q.status in ('arrived', 'late')
    and q.missed_turn_at is null
  order by q.position, q.created_at, q.id
  limit 1;

  if v_next is null then
    return;
  end if;

  -- A new patient is being called. Booked visitors whose time has come and who
  -- have not checked in are passed: shifted, then Delayed past the grace limit.
  -- (Replacing a Ready patient with a booked visitor is not a new call.)
  if v_demote is null then
    v_call_at := public._queue_anchor(p_session_id);
    select clinic_date into v_date from public.clinic_sessions where id = p_session_id;
    for r in
      select a.id, a.grace_shifts
      from public.appointments a
      join public.queue_entries q on q.appointment_id = a.id and q.status = 'scheduled'
      where a.clinic_date = v_date
        and a.status = 'scheduled'
        and a.delayed_at is null
        and a.scheduled_start is not null
        and a.scheduled_start <= v_call_at
        and (v_next_at is null or v_next_at > a.scheduled_start)
      for update of a
    loop
      update public.appointments
      set grace_shifts = r.grace_shifts + 1,
          delayed_at   = case when r.grace_shifts + 1 > public._booking_grace_limit() then now() end
      where id = r.id;
    end loop;
  end if;

  perform set_config('mosa3da.auto_ready', 'on', true);
  update public.queue_entries
  set status = 'ready', ready_at = now()
  where id = v_next;
  perform set_config('mosa3da.auto_ready', '', true);
end;
$$;

-- Check-in. A Delayed visitor lost her priority: she joins the end as Late.
create or replace function public._check_in_entry(p_entry public.queue_entries)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delayed boolean := exists (
    select 1 from public.appointments where id = p_entry.appointment_id and delayed_at is not null
  );
begin
  update public.queue_entries
  set status       = case when v_delayed then 'late'::public.queue_status else 'arrived'::public.queue_status end,
      late_at      = case when v_delayed then now() end,
      arrived_at   = now(),
      queue_number = public._take_queue_number(p_entry.session_id),
      position     = public._next_position(p_entry.session_id)
  where id = p_entry.id;

  update public.appointments
  set status = 'checked_in', checked_in_at = now()
  where id = p_entry.appointment_id and status = 'scheduled';
end;
$$;

-- Lobby screen: same as before, plus Shifted / Delayed on bookings not yet here.
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
    select qe.id, qe.queue_number, qe.status, qe.position, qe.created_at, qe.started_at,
           qe.estimated_duration_minutes,
           p.full_name as name_ar, p.full_name_en as name_en
    from public.queue_entries qe
    join s on s.id = qe.session_id
    join public.patients p on p.id = qe.patient_id
    where qe.status in ('current', 'ready', 'arrived', 'late')
      and qe.missed_turn_at is null
  ),
  anchor as (
    select coalesce(
      (select greatest(c.started_at + make_interval(mins => c.estimated_duration_minutes), now())
         from q c where c.status = 'current'),
      greatest((select opens_at from s), now()),
      now()
    ) as at
  ),
  eligible as (
    select q.*,
           (select at from anchor) + make_interval(mins => coalesce(sum(q.estimated_duration_minutes) over (
             order by (q.status = 'ready') desc, q.position, q.created_at, q.id
             rows between unbounded preceding and 1 preceding), 0)::integer) as eta
    from q
    where q.status in ('ready', 'arrived', 'late')
  ),
  booked as (
    select a.scheduled_start, a.scheduled_end, p.full_name as name_ar, p.full_name_en as name_en, a.id,
           a.grace_shifts, a.delayed_at
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    where a.clinic_date = public.clinic_today()
      and a.status = 'scheduled'
      and a.scheduled_start is not null
  )
  select jsonb_build_object(
    'clinic', (select jsonb_build_object(
                 'name', ds.clinic_name, 'name_ar', ds.clinic_name_ar,
                 'doctor', ds.doctor_display_name, 'timezone', ds.timezone,
                 'bilingual', ds.display_bilingual)
               from public.doctor_settings ds where ds.id = 1),
    'session_open', exists (select 1 from s where s.status = 'open'),
    'current', (select jsonb_build_object('queue_number', queue_number, 'display_name', name_ar,
                                          'name_ar', name_ar, 'name_en', name_en, 'started_at', started_at)
                from q where status = 'current'),
    'next',    (select jsonb_build_object('queue_number', queue_number, 'display_name', name_ar,
                                          'name_ar', name_ar, 'name_en', name_en, 'expected_start_at', eta)
                from eligible where status = 'ready'),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object(
                           'queue_number', queue_number, 'display_name', name_ar,
                           'name_ar', name_ar, 'name_en', name_en,
                           'expected_start_at', eta, 'is_late', status = 'late')
                         order by eta, position, created_at, id)
                         from eligible where status in ('arrived', 'late')), '[]'::jsonb),
    'booked',  coalesce((select jsonb_agg(jsonb_build_object(
                           'name_ar', name_ar, 'name_en', name_en,
                           'slot_start', scheduled_start, 'slot_end', scheduled_end,
                           'grace_shifts', grace_shifts, 'is_delayed', delayed_at is not null)
                         order by scheduled_start, id)
                         from booked), '[]'::jsonb),
    'generated_at', now()
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Staff booking by day
-- -----------------------------------------------------------------------------

-- Same as before, plus p_exclude: a booking to leave out (when moving it).
drop function if exists public._earliest_free_start(date, integer);
create or replace function public._earliest_free_start(p_date date, p_minutes integer, p_exclude uuid default null)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.doctor_settings where id = 1),
  periods as (
    select public.clinic_local_to_utc(p_date, w.start_time) as p_start,
           public.clinic_local_to_utc(p_date, w.end_time)   as p_end
    from public.clinic_working_days w
    where w.is_active and w.weekday = extract(dow from p_date)::smallint
  ),
  busy as (
    select tstzrange(a.scheduled_start, a.scheduled_end, '[)') as r
    from public.appointments a
    where a.status in ('scheduled', 'checked_in')
      and a.scheduled_start is not null
      and a.clinic_date = p_date
      and a.id is distinct from p_exclude
    union all
    select tstzrange(coalesce(q.started_at, q.expected_start_at),
                     coalesce(q.started_at, q.expected_start_at) + make_interval(mins => q.estimated_duration_minutes), '[)')
    from public.queue_entries q
    left join public.appointments a on a.id = q.appointment_id
    where q.clinic_date = p_date
      and q.status in ('arrived', 'ready', 'current', 'late')
      and coalesce(q.started_at, q.expected_start_at) is not null
      and (a.id is null or a.scheduled_start is null)
  ),
  candidates as (
    select p.p_start + make_interval(mins => g.n * s.slot_interval_minutes) as c
    from periods p, s,
         lateral generate_series(0, greatest(0, (extract(epoch from (p.p_end - p.p_start)) / 60)::integer / s.slot_interval_minutes)) g(n)
    union
    select upper(b.r) from busy b
  )
  select c.c
  from candidates c
  where c.c >= now() + interval '15 minutes'
    and exists (
      select 1 from periods p
      where c.c >= p.p_start and c.c + make_interval(mins => p_minutes) <= p.p_end
    )
    and not exists (
      select 1 from busy b where b.r && tstzrange(c.c, c.c + make_interval(mins => p_minutes), '[)')
    )
  order by c.c
  limit 1
$$;

revoke execute on function public._earliest_free_start(date, integer, uuid) from public, anon, authenticated;

-- Staff booking: pick a visitor, a day and a reason; the time is assigned.
create or replace function public.staff_book_appointment_on_date(
  p_patient_id            uuid,
  p_date                  date,
  p_visit_reason          public.visit_reason,
  p_visit_reason_details  text default null,
  p_notes                 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public._require_staff();
  v_today   date := public.clinic_today();
  v_minutes integer;
  v_start   timestamptz;
  v_id      uuid;
begin
  if not exists (select 1 from public.patients where id = p_patient_id and is_active) then
    raise exception 'Patient not found' using errcode = 'MQ404';
  end if;
  if p_date is null or p_date < v_today then
    raise exception 'This day is outside the booking window' using errcode = 'MQ422';
  end if;
  if p_visit_reason = 'other' and nullif(btrim(p_visit_reason_details), '') is null then
    raise exception 'Please describe the reason for the visit' using errcode = 'MQ422';
  end if;
  if not exists (
    select 1 from public.clinic_working_days w
    where w.is_active and w.weekday = extract(dow from p_date)::smallint
  ) then
    raise exception 'The clinic is closed on this day' using errcode = 'MQ422';
  end if;

  perform pg_advisory_xact_lock(hashtext('mosa3da.book_on_date'), (p_date - date '2000-01-01'));

  if exists (
    select 1 from public.appointments a
    where a.patient_id = p_patient_id and a.clinic_date = p_date and a.status in ('scheduled', 'checked_in')
  ) then
    raise exception 'This patient already has an appointment on this day' using errcode = 'MQ422';
  end if;

  v_minutes := public._visit_reason_minutes(p_visit_reason, p_visit_reason_details);
  v_start := public._earliest_free_start(p_date, v_minutes);
  if v_start is null then
    raise exception 'No appointments are left on this day. Please choose another day.' using errcode = 'MQ409';
  end if;

  insert into public.appointments
    (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason,
     visit_reason_details, patient_notes, status, source, booked_by)
  values
    (p_patient_id, p_date, v_start, v_start + make_interval(mins => v_minutes), v_minutes,
     p_visit_reason, nullif(btrim(p_visit_reason_details), ''), nullif(btrim(p_notes), ''),
     'scheduled', 'staff', v_actor)
  returning id into v_id;

  if p_date = v_today
     and exists (select 1 from public.clinic_sessions where clinic_date = p_date and status <> 'closed') then
    perform public._ensure_session(p_date);
  end if;

  return jsonb_build_object(
    'appointment_id', v_id,
    'clinic_date', p_date,
    'scheduled_start', v_start,
    'scheduled_end', v_start + make_interval(mins => v_minutes)
  );
end;
$$;

-- Staff reschedule to another day (or the same day): the earliest free time.
create or replace function public.staff_reschedule_on_date(p_appointment_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._require_staff();
  v_appt  public.appointments;
  v_start timestamptz;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if v_appt.status <> 'scheduled' then
    raise exception 'Only scheduled appointments can be rescheduled. Checked-in patients are managed from the queue.'
      using errcode = 'MQ409';
  end if;
  if p_date is null or p_date < public.clinic_today() then
    raise exception 'This day is outside the booking window' using errcode = 'MQ422';
  end if;
  if not exists (
    select 1 from public.clinic_working_days w
    where w.is_active and w.weekday = extract(dow from p_date)::smallint
  ) then
    raise exception 'The clinic is closed on this day' using errcode = 'MQ422';
  end if;

  perform pg_advisory_xact_lock(hashtext('mosa3da.book_on_date'), (p_date - date '2000-01-01'));

  if exists (
    select 1 from public.appointments a
    where a.patient_id = v_appt.patient_id and a.clinic_date = p_date
      and a.status in ('scheduled', 'checked_in') and a.id <> v_appt.id
  ) then
    raise exception 'This patient already has an appointment on this day' using errcode = 'MQ422';
  end if;

  v_start := public._earliest_free_start(p_date, v_appt.duration_minutes, v_appt.id);
  if v_start is null then
    raise exception 'No appointments are left on this day. Please choose another day.' using errcode = 'MQ409';
  end if;

  update public.appointments
  set clinic_date     = p_date,
      scheduled_start = v_start,
      scheduled_end   = v_start + make_interval(mins => v_appt.duration_minutes),
      grace_shifts    = 0,
      delayed_at      = null
  where id = v_appt.id;

  if p_date = v_appt.clinic_date then
    update public.queue_entries
    set expected_start_at = v_start
    where appointment_id = v_appt.id and status = 'scheduled';
  else
    delete from public.queue_entries where appointment_id = v_appt.id and status = 'scheduled';
  end if;

  if p_date = public.clinic_today()
     and exists (select 1 from public.clinic_sessions where clinic_date = p_date and status <> 'closed') then
    perform public._ensure_session(p_date);
  end if;

  return jsonb_build_object(
    'appointment_id', v_appt.id,
    'clinic_date', p_date,
    'scheduled_start', v_start,
    'scheduled_end', v_start + make_interval(mins => v_appt.duration_minutes)
  );
end;
$$;

-- The old time-picking reschedule clears the grace counters too.
create or replace function public.appointments_reset_grace()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_start is distinct from old.scheduled_start then
    new.grace_shifts := 0;
    new.delayed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_reset_grace on public.appointments;
create trigger appointments_reset_grace
  before update of scheduled_start on public.appointments
  for each row execute function public.appointments_reset_grace();

revoke execute on function public.staff_book_appointment_on_date(uuid, date, public.visit_reason, text, text) from public, anon;
grant execute on function public.staff_book_appointment_on_date(uuid, date, public.visit_reason, text, text) to authenticated;
revoke execute on function public.staff_reschedule_on_date(uuid, date) from public, anon;
grant execute on function public.staff_reschedule_on_date(uuid, date) to authenticated;
revoke execute on function public._sequence_waiting(uuid) from public, anon, authenticated;
revoke execute on function public._queue_anchor(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Fees pop-up for every booking
-- -----------------------------------------------------------------------------
alter table public.doctor_settings
  add column if not exists show_fees_to_all boolean not null default false;

-- -----------------------------------------------------------------------------
-- 4. Visit feedback
-- -----------------------------------------------------------------------------
create table if not exists public.visit_feedback (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,
  rating         smallint check (rating between 1 and 5),
  comment        text check (comment is null or char_length(comment) <= 1000),
  status         text not null check (status in ('submitted', 'dismissed')),
  created_at     timestamptz not null default now(),
  constraint visit_feedback_rating_when_submitted check ((status = 'submitted') = (rating is not null))
);

create index if not exists visit_feedback_created_idx on public.visit_feedback (created_at desc) where status = 'submitted';

alter table public.visit_feedback enable row level security;

drop policy if exists visit_feedback_doctor_read on public.visit_feedback;
create policy visit_feedback_doctor_read on public.visit_feedback
  for select to authenticated using (public.is_doctor());

grant select on public.visit_feedback to authenticated;

-- The visitor's latest finished visit (last 14 days) she has not rated or
-- dismissed yet, or null. Older visits are not asked about.
create or replace function public.get_pending_feedback()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'appointment_id', a.id,
    'clinic_date', a.clinic_date,
    'completed_at', a.completed_at,
    'doctor', (select ds.doctor_display_name from public.doctor_settings ds where ds.id = 1)
  )
  from public.appointments a
  where a.patient_id = public.current_patient_id()
    and a.status = 'completed'
    and a.completed_at is not null
    and a.completed_at > now() - interval '14 days'
    and not exists (select 1 from public.visit_feedback f where f.appointment_id = a.id)
    and not exists (
      select 1 from public.appointments later
      join public.visit_feedback f on f.appointment_id = later.id
      where later.patient_id = a.patient_id and later.completed_at > a.completed_at
    )
  order by a.completed_at desc
  limit 1
$$;

-- Saves the rating, or the dismissal when p_rating is null. Once per visit.
create or replace function public.save_visit_feedback(
  p_appointment_id uuid,
  p_rating         smallint default null,
  p_comment        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := public.current_patient_id();
  v_saved   boolean;
begin
  if v_patient is null then
    raise exception 'Only visitors can rate a visit' using errcode = 'MQ403';
  end if;
  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.patient_id = v_patient and a.status = 'completed'
  ) then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Choose a rating from 1 to 5 stars' using errcode = 'MQ422';
  end if;

  insert into public.visit_feedback (appointment_id, patient_id, rating, comment, status)
  values (p_appointment_id, v_patient, p_rating,
          case when p_rating is null then null else nullif(left(btrim(p_comment), 1000), '') end,
          case when p_rating is null then 'dismissed' else 'submitted' end)
  on conflict (appointment_id) do nothing
  returning true into v_saved;

  return jsonb_build_object('saved', coalesce(v_saved, false));
end;
$$;

revoke execute on function public.get_pending_feedback() from public, anon;
grant execute on function public.get_pending_feedback() to authenticated;
revoke execute on function public.save_visit_feedback(uuid, smallint, text) from public, anon;
grant execute on function public.save_visit_feedback(uuid, smallint, text) to authenticated;

commit;
