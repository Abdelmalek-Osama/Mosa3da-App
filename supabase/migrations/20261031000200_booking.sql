-- =============================================================================
-- Mosa3da — Migration 0003: Patient booking
--
-- Availability is derived from clinic_working_days + doctor_settings, minus
-- active booked appointments. Booking re-validates the slot inside the same
-- transaction; the exclusion constraint on appointments is the final guard
-- against two patients taking the same slot concurrently.
-- =============================================================================

begin;

-- Slots for one clinic date (clinic timezone). Past slots and slots closer than
-- 15 minutes are never available. Staff and patients may call this.
create or replace function public.get_available_slots(p_date date)
returns table (slot_start timestamptz, slot_end timestamptz, available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today    date := public.clinic_today();
  v_settings public.doctor_settings;
begin
  if auth.uid() is null and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to view availability' using errcode = 'MQ403';
  end if;

  select * into v_settings from public.doctor_settings where id = 1;

  if p_date < v_today or p_date > v_today + v_settings.booking_horizon_days then
    return;
  end if;

  return query
  with periods as (
    select start_time, end_time
    from public.clinic_working_days
    where is_active and weekday = extract(dow from p_date)::smallint
  ),
  slots as (
    select public.clinic_local_to_utc(p_date, p.start_time) + make_interval(mins => g.n * v_settings.slot_interval_minutes) as s,
           public.clinic_local_to_utc(p_date, p.end_time) as period_end
    from periods p
    cross join lateral generate_series(
      0,
      greatest(0, (extract(epoch from (p.end_time - p.start_time)) / 60)::integer / v_settings.slot_interval_minutes)
    ) as g(n)
  )
  select sl.s,
         sl.s + make_interval(mins => v_settings.default_consultation_minutes),
         sl.s >= now() + interval '15 minutes'
           and not exists (
             select 1 from public.appointments a
             where a.status in ('scheduled', 'checked_in')
               and a.scheduled_start is not null
               and tstzrange(a.scheduled_start, a.scheduled_end, '[)')
                   && tstzrange(sl.s, sl.s + make_interval(mins => v_settings.default_consultation_minutes), '[)')
           )
  from slots sl
  where sl.s + make_interval(mins => v_settings.default_consultation_minutes) <= sl.period_end
  order by sl.s;
end;
$$;

-- Bookable dates within the horizon, with free-slot counts.
create or replace function public.get_booking_calendar()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.doctor_settings where id = 1),
  days as (
    select (public.clinic_today() + g.n)::date as d
    from s, generate_series(0, s.booking_horizon_days) as g(n)
  )
  select jsonb_build_object(
    'timezone', (select timezone from s),
    'default_duration_minutes', (select default_consultation_minutes from s),
    'cancellation_cutoff_minutes', (select cancellation_cutoff_minutes from s),
    'dates', coalesce(jsonb_agg(jsonb_build_object('date', days.d, 'free', free.n) order by days.d), '[]'::jsonb)
  )
  from days
  cross join lateral (
    select count(*) filter (where x.available)::integer as n
    from public.get_available_slots(days.d) x
  ) free
  where exists (
    select 1 from public.clinic_working_days w
    where w.is_active and w.weekday = extract(dow from days.d)::smallint
  )
$$;

-- Patient self-booking.
create or replace function public.book_appointment(
  p_slot_start            timestamptz,
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
  v_date       date;
  v_slot       record;
  v_id         uuid;
  v_duration   integer := coalesce((select default_consultation_minutes from public.doctor_settings where id = 1), 20);
begin
  if v_patient_id is null then
    raise exception 'Only verified patients can book appointments' using errcode = 'MQ403';
  end if;
  if p_visit_reason = 'other' and nullif(btrim(p_visit_reason_details), '') is null then
    raise exception 'Please describe the reason for your visit' using errcode = 'MQ422';
  end if;

  v_date := (p_slot_start at time zone public._clinic_timezone())::date;

  select * into v_slot from public.get_available_slots(v_date) x where x.slot_start = p_slot_start;
  if v_slot.slot_start is null then
    raise exception 'This time is outside the clinic''s working hours' using errcode = 'MQ422';
  end if;
  if not v_slot.available then
    raise exception 'This time is no longer available. Please choose another.' using errcode = 'MQ409';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.patient_id = v_patient_id and a.clinic_date = v_date and a.status in ('scheduled', 'checked_in')
  ) then
    raise exception 'You already have an appointment on this day. Cancel it first to choose another time.'
      using errcode = 'MQ422';
  end if;

  insert into public.appointments
    (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason,
     visit_reason_details, patient_notes, status, source, booked_by)
  values
    (v_patient_id, v_date, p_slot_start, p_slot_start + make_interval(mins => v_duration), v_duration,
     p_visit_reason, nullif(btrim(p_visit_reason_details), ''), nullif(btrim(p_notes), ''),
     'scheduled', 'patient_portal', auth.uid())
  returning id into v_id;

  -- Same-day booking: show it as Scheduled on today's queue right away.
  if v_date = public.clinic_today()
     and exists (select 1 from public.clinic_sessions where clinic_date = v_date and status <> 'closed') then
    perform public._ensure_session(v_date);
  end if;

  return jsonb_build_object('appointment_id', v_id, 'clinic_date', v_date,
                            'scheduled_start', p_slot_start,
                            'scheduled_end', p_slot_start + make_interval(mins => v_duration));
end;
$$;

-- Patient self-cancellation, respecting the cutoff.
create or replace function public.cancel_my_appointment(p_appointment_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid := public.current_patient_id();
  v_appt       public.appointments;
  v_cutoff     integer := coalesce((select cancellation_cutoff_minutes from public.doctor_settings where id = 1), 120);
begin
  if v_patient_id is null then
    raise exception 'Patient account required' using errcode = 'MQ403';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null or v_appt.patient_id <> v_patient_id then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if v_appt.status <> 'scheduled' then
    raise exception 'This appointment can no longer be cancelled online. Please contact the clinic.' using errcode = 'MQ409';
  end if;
  if v_appt.scheduled_start is not null and v_appt.scheduled_start - now() < make_interval(mins => v_cutoff) then
    raise exception 'Appointments can be cancelled online up to % hours before. Please call the clinic.',
      round(v_cutoff / 60.0, 1) using errcode = 'MQ409';
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = left(nullif(btrim(p_reason), ''), 500)
  where id = v_appt.id;

  update public.queue_entries
  set status = 'cancelled', cancelled_at = now()
  where appointment_id = v_appt.id and status = 'scheduled';

  return jsonb_build_object('appointment_id', v_appt.id, 'status', 'cancelled');
end;
$$;

revoke execute on function public.get_available_slots(date) from public, anon;
revoke execute on function public.get_booking_calendar() from public, anon;
revoke execute on function public.book_appointment(timestamptz, public.visit_reason, text, text) from public, anon;
revoke execute on function public.cancel_my_appointment(uuid, text) from public, anon;
grant execute on function public.get_available_slots(date) to authenticated;
grant execute on function public.get_booking_calendar() to authenticated;
grant execute on function public.book_appointment(timestamptz, public.visit_reason, text, text) to authenticated;
grant execute on function public.cancel_my_appointment(uuid, text) to authenticated;

commit;
