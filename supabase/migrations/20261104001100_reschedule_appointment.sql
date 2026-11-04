-- =============================================================================
-- Migration 0012: Staff reschedule (P1-08)
--
-- Moves a booking that has not checked in to another free slot instead of
-- cancelling and re-booking. Same rules as staff_book_appointment: the new time
-- must be a free slot inside working hours (get_available_slots) and the visitor
-- may have only one active appointment per day. The old slot is freed at once.
-- Today's 'scheduled' queue placeholder follows the booking (or is removed when
-- the booking moves to another day; _ensure_session recreates it when needed).
-- =============================================================================

begin;

create or replace function public.staff_reschedule_appointment(p_appointment_id uuid, p_slot_start timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._require_staff();
  v_appt  public.appointments;
  v_date  date;
  v_slot  record;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    raise exception 'Appointment not found' using errcode = 'MQ404';
  end if;
  if v_appt.status <> 'scheduled' then
    raise exception 'Only scheduled appointments can be rescheduled. Checked-in patients are managed from the queue.'
      using errcode = 'MQ409';
  end if;
  if v_appt.scheduled_start = p_slot_start then
    return jsonb_build_object('appointment_id', v_appt.id, 'clinic_date', v_appt.clinic_date, 'scheduled_start', v_appt.scheduled_start);
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
    where a.patient_id = v_appt.patient_id and a.clinic_date = v_date
      and a.status in ('scheduled', 'checked_in') and a.id <> v_appt.id
  ) then
    raise exception 'This patient already has an appointment on this day' using errcode = 'MQ422';
  end if;

  update public.appointments
  set clinic_date     = v_date,
      scheduled_start = p_slot_start,
      scheduled_end   = p_slot_start + make_interval(mins => v_appt.duration_minutes)
  where id = v_appt.id;

  if v_date = v_appt.clinic_date then
    update public.queue_entries
    set expected_start_at = p_slot_start
    where appointment_id = v_appt.id and status = 'scheduled';
  else
    delete from public.queue_entries where appointment_id = v_appt.id and status = 'scheduled';
  end if;

  if v_date = public.clinic_today()
     and exists (select 1 from public.clinic_sessions where clinic_date = v_date and status <> 'closed') then
    perform public._ensure_session(v_date);
  end if;

  return jsonb_build_object('appointment_id', v_appt.id, 'clinic_date', v_date, 'scheduled_start', p_slot_start);
end;
$$;

revoke execute on function public.staff_reschedule_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.staff_reschedule_appointment(uuid, timestamptz) to authenticated;

commit;
