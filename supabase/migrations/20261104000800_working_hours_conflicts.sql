-- =============================================================================
-- Migration 0009: Warn before closing days that still have bookings (P0-03)
--
-- New bookings were already limited to working hours (get_available_slots),
-- but the doctor could close a day (or shorten it) while booked appointments
-- still existed on it, leaving bookings on "Closed" days.
--
-- save_working_days now first checks upcoming active appointments against the
-- NEW periods. If any would fall outside them, nothing is saved and the
-- conflicts are returned so the UI can warn; p_force = true saves anyway.
-- Returns { saved, count, conflicts: [{ appointment_id, clinic_date, scheduled_start, patient_name }] }.
-- =============================================================================

begin;

drop function if exists public.save_working_days(jsonb);

create or replace function public.save_working_days(p_periods jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count     integer;
  v_tz        text := public._clinic_timezone();
  v_conflicts jsonb;
begin
  if not public.is_doctor() then
    raise exception 'Only the doctor can change working hours' using errcode = 'MQ403';
  end if;
  if jsonb_typeof(p_periods) <> 'array' then
    raise exception 'Invalid working hours' using errcode = 'MQ422';
  end if;

  -- Upcoming bookings that no new period fully covers.
  select coalesce(jsonb_agg(jsonb_build_object(
           'appointment_id',  a.id,
           'clinic_date',     a.clinic_date,
           'scheduled_start', a.scheduled_start,
           'patient_name',    p.full_name
         ) order by a.scheduled_start), '[]'::jsonb)
  into v_conflicts
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  where a.status = 'scheduled'
    and a.clinic_date >= public.clinic_today()
    and a.scheduled_start is not null
    and not exists (
      select 1 from jsonb_array_elements(p_periods) w
      where (w ->> 'weekday')::smallint = extract(dow from a.clinic_date)::smallint
        and (a.scheduled_start at time zone v_tz)::time >= (w ->> 'start_time')::time
        and (coalesce(a.scheduled_end, a.scheduled_start) at time zone v_tz)::time <= (w ->> 'end_time')::time
    );

  if jsonb_array_length(v_conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'count', 0, 'conflicts', v_conflicts);
  end if;

  delete from public.clinic_working_days where true;

  begin
    insert into public.clinic_working_days (weekday, start_time, end_time, is_active)
    select (p ->> 'weekday')::smallint, (p ->> 'start_time')::time, (p ->> 'end_time')::time, true
    from jsonb_array_elements(p_periods) p;
  exception
    when exclusion_violation then
      raise exception 'Two working periods overlap on the same day' using errcode = 'MQ422';
    when check_violation then
      raise exception 'Each period must end after it starts' using errcode = 'MQ422';
  end;

  get diagnostics v_count = row_count;
  return jsonb_build_object('saved', true, 'count', v_count, 'conflicts', v_conflicts);
end;
$$;

revoke execute on function public.save_working_days(jsonb, boolean) from public, anon;
grant execute on function public.save_working_days(jsonb, boolean) to authenticated;

commit;
