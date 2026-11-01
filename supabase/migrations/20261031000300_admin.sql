-- =============================================================================
-- Mosa3da — Migration 0004: Admin workspace
--
-- Staff booking / cancellation / check-in for the Appointments page and an
-- atomic "replace weekly hours" for the doctor's Settings page. Patients and
-- doctor_settings are edited directly under the RLS policies of migration 0001.
-- Secretary accounts are provisioned by trusted server code with the Admin API.
-- =============================================================================

begin;

-- Staff books a slot for an existing patient (same rules as patient booking).
create or replace function public.staff_book_appointment(
  p_patient_id            uuid,
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
  v_actor    uuid := public._require_staff();
  v_date     date;
  v_slot     record;
  v_id       uuid;
  v_duration integer := coalesce((select default_consultation_minutes from public.doctor_settings where id = 1), 20);
begin
  if not exists (select 1 from public.patients where id = p_patient_id and is_active) then
    raise exception 'Patient not found' using errcode = 'MQ404';
  end if;
  if p_visit_reason = 'other' and nullif(btrim(p_visit_reason_details), '') is null then
    raise exception 'Please describe the reason for the visit' using errcode = 'MQ422';
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
    where a.patient_id = p_patient_id and a.clinic_date = v_date and a.status in ('scheduled', 'checked_in')
  ) then
    raise exception 'This patient already has an appointment on this day' using errcode = 'MQ422';
  end if;

  insert into public.appointments
    (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason,
     visit_reason_details, patient_notes, status, source, booked_by)
  values
    (p_patient_id, v_date, p_slot_start, p_slot_start + make_interval(mins => v_duration), v_duration,
     p_visit_reason, nullif(btrim(p_visit_reason_details), ''), nullif(btrim(p_notes), ''),
     'scheduled', 'staff', v_actor)
  returning id into v_id;

  if v_date = public.clinic_today()
     and exists (select 1 from public.clinic_sessions where clinic_date = v_date and status <> 'closed') then
    perform public._ensure_session(v_date);
  end if;

  return jsonb_build_object('appointment_id', v_id, 'clinic_date', v_date, 'scheduled_start', p_slot_start);
end;
$$;

-- Staff cancellation (no cutoff; only bookings not yet checked in).
create or replace function public.staff_cancel_appointment(p_appointment_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._require_staff();
  v_appt  public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if v_appt.status <> 'scheduled' then
    raise exception 'Only scheduled appointments can be cancelled here. Checked-in patients are managed from the queue.'
      using errcode = 'MQ409';
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
      cancellation_reason = left(nullif(btrim(p_reason), ''), 500)
  where id = v_appt.id;

  update public.queue_entries
  set status = 'cancelled', cancelled_at = now()
  where appointment_id = v_appt.id and status = 'scheduled';

  return jsonb_build_object('appointment_id', v_appt.id, 'status', 'cancelled');
end;
$$;

-- Check in today's booked patient: opens today's session if needed and runs
-- the queue engine's mark_arrived transition (number, position, estimates).
create or replace function public.check_in_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt  public.appointments;
  v_entry uuid;
begin
  perform public._require_staff();

  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if v_appt.status <> 'scheduled' then
    raise exception 'This appointment is not waiting for check-in' using errcode = 'MQ409';
  end if;
  if v_appt.clinic_date <> public.clinic_today() then
    raise exception 'Only today''s appointments can be checked in' using errcode = 'MQ409';
  end if;

  perform public._ensure_session(v_appt.clinic_date);

  select id into v_entry from public.queue_entries
  where appointment_id = v_appt.id and status = 'scheduled'
  limit 1;
  if v_entry is null then
    raise exception 'No queue entry found for this appointment' using errcode = 'MQ409';
  end if;

  return public.queue_transition(v_entry, 'mark_arrived', null, null);
end;
$$;

-- Doctor replaces the weekly working hours atomically.
-- p_periods: [{ "weekday": 0-6, "start_time": "HH:MM", "end_time": "HH:MM" }, ...]
create or replace function public.save_working_days(p_periods jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_doctor() then
    raise exception 'Only the doctor can change working hours' using errcode = 'MQ403';
  end if;
  if jsonb_typeof(p_periods) <> 'array' then
    raise exception 'Invalid working hours' using errcode = 'MQ422';
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
  return v_count;
end;
$$;

revoke execute on function public.staff_book_appointment(uuid, timestamptz, public.visit_reason, text, text) from public, anon;
revoke execute on function public.staff_cancel_appointment(uuid, text) from public, anon;
revoke execute on function public.check_in_appointment(uuid) from public, anon;
revoke execute on function public.save_working_days(jsonb) from public, anon;
grant execute on function public.staff_book_appointment(uuid, timestamptz, public.visit_reason, text, text) to authenticated;
grant execute on function public.staff_cancel_appointment(uuid, text) to authenticated;
grant execute on function public.check_in_appointment(uuid) to authenticated;
grant execute on function public.save_working_days(jsonb) to authenticated;

commit;
