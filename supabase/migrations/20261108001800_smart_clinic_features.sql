-- =============================================================================
-- Migration 0019: Smart Clinics features (2026-11-08)
--
-- 1. Day-only online booking (FIFO). Visitors no longer pick a time: they pick
--    a day and book_appointment_on_date gives them the earliest free time that
--    fits their visit reason, counted from the clinic's opening time. Bookings
--    for one day are serialized with an advisory lock, so two visitors who
--    confirm at the same moment get consecutive times instead of a conflict.
--    The old time-picking book_appointment is no longer callable by visitors.
-- 2. Services & fees managed by the doctor (clinic_services), shown to a
--    first-time visitor right after her first booking (is_first_booking).
-- 3. Consultation logs read queue_entries.started_at / finished_at, which the
--    queue engine already records, so no schema change is needed for them.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Day-only booking
-- -----------------------------------------------------------------------------

-- Configured length of a visit reason; same rules as appointments_apply_reason_duration.
create or replace function public._visit_reason_minutes(p_reason public.visit_reason, p_details text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_minutes integer;
  v_active  boolean;
begin
  if p_reason = 'other' and nullif(btrim(p_details), '') is not null then
    select c.default_duration_minutes into v_minutes
    from public.custom_visit_reasons c
    where c.is_active
      and (lower(btrim(c.label_ar)) = lower(btrim(p_details))
           or lower(btrim(coalesce(c.label_en, ''))) = lower(btrim(p_details)))
    limit 1;
    if v_minutes is not null then
      return v_minutes;
    end if;
  end if;

  select s.default_duration_minutes, s.is_active into v_minutes, v_active
  from public.visit_reason_settings s where s.reason = p_reason;
  if v_active = false then
    raise exception 'This visit reason is not available' using errcode = 'MQ422';
  end if;
  return coalesce(v_minutes, (select default_consultation_minutes from public.doctor_settings where id = 1), 20);
end;
$$;

-- Earliest start on p_date where a visit of p_minutes fits: inside a working
-- period, at least 15 minutes from now, and overlapping no booking or walk-in.
-- Candidates are the slot grid plus the end of every busy block, so visits are
-- packed back to back from the opening time without gaps.
create or replace function public._earliest_free_start(p_date date, p_minutes integer)
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

-- Visitor self-booking by day. Returns the assigned arrival time.
create or replace function public.book_appointment_on_date(
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
  v_patient_id uuid := public.current_patient_id();
  v_today      date := public.clinic_today();
  v_horizon    integer := coalesce((select booking_horizon_days from public.doctor_settings where id = 1), 30);
  v_minutes    integer;
  v_start      timestamptz;
  v_first      boolean;
  v_id         uuid;
begin
  if v_patient_id is null then
    raise exception 'Only verified patients can book appointments' using errcode = 'MQ403';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + v_horizon then
    raise exception 'This day is outside the booking window' using errcode = 'MQ422';
  end if;
  if p_visit_reason = 'other' and nullif(btrim(p_visit_reason_details), '') is null then
    raise exception 'Please describe the reason for your visit' using errcode = 'MQ422';
  end if;
  if not exists (
    select 1 from public.clinic_working_days w
    where w.is_active and w.weekday = extract(dow from p_date)::smallint
  ) then
    raise exception 'The clinic is closed on this day' using errcode = 'MQ422';
  end if;

  -- One booking at a time per clinic day: concurrent visitors queue up here and
  -- each one gets the next free time (first come, first served).
  perform pg_advisory_xact_lock(hashtext('mosa3da.book_on_date'), (p_date - date '2000-01-01'));

  if exists (
    select 1 from public.appointments a
    where a.patient_id = v_patient_id and a.clinic_date = p_date and a.status in ('scheduled', 'checked_in')
  ) then
    raise exception 'You already have an appointment on this day. Cancel it first to choose another time.'
      using errcode = 'MQ422';
  end if;

  v_minutes := public._visit_reason_minutes(p_visit_reason, p_visit_reason_details);
  v_start := public._earliest_free_start(p_date, v_minutes);
  if v_start is null then
    raise exception 'No appointments are left on this day. Please choose another day.' using errcode = 'MQ409';
  end if;

  v_first := not exists (select 1 from public.appointments a where a.patient_id = v_patient_id);

  insert into public.appointments
    (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason,
     visit_reason_details, patient_notes, status, source, booked_by)
  values
    (v_patient_id, p_date, v_start, v_start + make_interval(mins => v_minutes), v_minutes,
     p_visit_reason, nullif(btrim(p_visit_reason_details), ''), nullif(btrim(p_notes), ''),
     'scheduled', 'patient_portal', auth.uid())
  returning id into v_id;

  if p_date = v_today
     and exists (select 1 from public.clinic_sessions where clinic_date = p_date and status <> 'closed') then
    perform public._ensure_session(p_date);
  end if;

  return jsonb_build_object(
    'appointment_id', v_id,
    'clinic_date', p_date,
    'scheduled_start', v_start,
    'scheduled_end', v_start + make_interval(mins => v_minutes),
    'is_first_booking', v_first
  );
end;
$$;

revoke execute on function public._visit_reason_minutes(public.visit_reason, text) from public, anon, authenticated;
revoke execute on function public._earliest_free_start(date, integer) from public, anon, authenticated;
revoke execute on function public.book_appointment_on_date(date, public.visit_reason, text, text) from public, anon;
grant execute on function public.book_appointment_on_date(date, public.visit_reason, text, text) to authenticated;

-- Visitors can no longer choose their own time.
revoke execute on function public.book_appointment(timestamptz, public.visit_reason, text, text) from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Services & fees
-- -----------------------------------------------------------------------------
create table if not exists public.clinic_services (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null check (char_length(btrim(name_ar)) between 2 and 80),
  name_en     text check (name_en is null or char_length(btrim(name_en)) between 2 and 80),
  price       numeric(10, 2) not null check (price >= 0 and price <= 1000000),
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

create unique index if not exists clinic_services_name_ar_key on public.clinic_services (lower(btrim(name_ar)));

alter table public.clinic_services enable row level security;

-- Visitors see shown services only; staff see all of them.
drop policy if exists clinic_services_read on public.clinic_services;
create policy clinic_services_read on public.clinic_services
  for select to authenticated using (is_active or public.is_staff());

drop policy if exists clinic_services_doctor_write on public.clinic_services;
create policy clinic_services_doctor_write on public.clinic_services
  for all to authenticated using (public.is_doctor()) with check (public.is_doctor());

grant select, insert, update, delete on public.clinic_services to authenticated;

-- The two services from the brief. Hidden until the doctor enters real prices.
insert into public.clinic_services (name_ar, name_en, price, is_active, sort_order)
select v.name_ar, v.name_en, 0, false, v.sort_order
from (values ('الكشف', 'Consultation', 1), ('السونار', 'Ultrasound (Sonar)', 2)) as v(name_ar, name_en, sort_order)
where not exists (select 1 from public.clinic_services);

-- Logs: list finished consultations quickly by date.
create index if not exists queue_entries_finished_idx
  on public.queue_entries (clinic_date desc, started_at desc) where status = 'finished';

commit;
