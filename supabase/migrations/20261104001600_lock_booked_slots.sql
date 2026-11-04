-- =============================================================================
-- Migration 0017: Booked time can never be booked twice (slot locking)
--
-- Gaps closed:
--  1. Walk-ins have no scheduled time, so get_available_slots ignored them and
--     the time a walk-in actually occupies in today's queue stayed bookable
--     (by reception or online). Today's active queue entries without a booked
--     time now block the slots they overlap (expected start .. + duration).
--  2. Since reasons have their own durations (0015), a booking can be longer
--     than one slot. A trigger now refuses any scheduled/checked-in appointment
--     whose time overlaps another one (new booking or reschedule), so
--     two bookings can never share time even under concurrent requests.
-- =============================================================================

begin;

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
  ),
  busy as (
    -- Booked appointments.
    select tstzrange(a.scheduled_start, a.scheduled_end, '[)') as r
    from public.appointments a
    where a.status in ('scheduled', 'checked_in')
      and a.scheduled_start is not null
      and a.clinic_date = p_date
    union all
    -- Walk-ins (no booked time) occupy their place in today's queue.
    select tstzrange(coalesce(q.started_at, q.expected_start_at),
                     coalesce(q.started_at, q.expected_start_at) + make_interval(mins => q.estimated_duration_minutes), '[)')
    from public.queue_entries q
    left join public.appointments a on a.id = q.appointment_id
    where q.clinic_date = p_date
      and q.status in ('arrived', 'ready', 'current', 'late')
      and coalesce(q.started_at, q.expected_start_at) is not null
      and (a.id is null or a.scheduled_start is null)
  )
  select sl.s,
         sl.s + make_interval(mins => v_settings.default_consultation_minutes),
         sl.s >= now() + interval '15 minutes'
           and not exists (
             select 1 from busy b
             where b.r && tstzrange(sl.s, sl.s + make_interval(mins => v_settings.default_consultation_minutes), '[)')
           )
  from slots sl
  where sl.s + make_interval(mins => v_settings.default_consultation_minutes) <= sl.period_end
  order by sl.s;
end;
$$;

create or replace function public.appointments_prevent_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('scheduled', 'checked_in') or new.scheduled_start is null or new.scheduled_end is null then
    return new;
  end if;
  -- Only new bookings and time changes are checked, so status changes (check-in,
  -- cancel) on bookings that already overlapped before this migration still work.
  if tg_op = 'UPDATE' and new.scheduled_start is not distinct from old.scheduled_start
     and new.scheduled_end is not distinct from old.scheduled_end then
    return new;
  end if;
  if exists (
    select 1 from public.appointments a
    where a.id <> new.id
      and a.status in ('scheduled', 'checked_in')
      and a.scheduled_start is not null
      and tstzrange(a.scheduled_start, a.scheduled_end, '[)') && tstzrange(new.scheduled_start, new.scheduled_end, '[)')
  ) then
    raise exception 'This time is no longer available. Please choose another.' using errcode = 'MQ409';
  end if;
  return new;
end;
$$;

-- Runs after appointments_apply_reason_duration (triggers fire in name order),
-- so the final duration is checked.
drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
  before insert or update of scheduled_start, scheduled_end on public.appointments
  for each row execute function public.appointments_prevent_overlap();

commit;
