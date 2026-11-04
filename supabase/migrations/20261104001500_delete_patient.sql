-- =============================================================================
-- Migration 0016: Permanently delete a visitor (Visitors page)
--
-- Staff remove mistaken, duplicate or test profiles. Refused while she is in
-- today's active queue. Deletes her queue entries (history cascades), her
-- appointments, notifications and codes, then the patient row, and returns her
-- portal auth user id so trusted server code can delete that account with the
-- Admin API (her profile row cascades from auth.users).
-- =============================================================================

begin;

create or replace function public.delete_patient(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public._require_staff();
  v_patient public.patients;
begin
  select * into v_patient from public.patients where id = p_patient_id for update;
  if v_patient.id is null then
    raise exception 'Patient not found' using errcode = 'MQ404';
  end if;

  if exists (
    select 1 from public.queue_entries
    where patient_id = p_patient_id
      and clinic_date = public.clinic_today()
      and status in ('arrived', 'ready', 'current', 'late')
  ) then
    raise exception 'She is in today''s queue. Finish or cancel her visit first.' using errcode = 'MQ409';
  end if;

  delete from public.notification_logs where patient_id = p_patient_id;
  delete from public.otp_verifications
   where patient_id = p_patient_id
      or normalized_phone = v_patient.normalized_phone
      or (v_patient.auth_user_id is not null and auth_user_id = v_patient.auth_user_id);
  delete from public.queue_entries where patient_id = p_patient_id;
  delete from public.appointments where patient_id = p_patient_id;
  delete from public.patients where id = p_patient_id;

  return jsonb_build_object('deleted', true, 'auth_user_id', v_patient.auth_user_id, 'full_name', v_patient.full_name);
end;
$$;

revoke execute on function public.delete_patient(uuid) from public, anon;
grant execute on function public.delete_patient(uuid) to authenticated;

commit;
