-- =============================================================================
-- Migration 0021: early-arrival buffer, secretary roles (2026-11-14)
--
-- 1. doctor_settings.arrival_buffer_minutes (0-120, default 0 = off).
--    Patients are told to arrive this many minutes before their real slot:
--    WhatsApp reminders and the 30-minute alert use that earlier time. The
--    real slot (appointments.scheduled_start) is unchanged for staff and for
--    the queue engine.
-- 2. Secretary accounts saved as patients.
--    Supabase Auth inserts a new user before it stores app_metadata, so
--    handle_new_auth_user() could see no role and create a 'patient' profile
--    for a secretary. The app now writes the profile explicitly; this adds a
--    database safeguard (role synced when app_metadata becomes 'secretary')
--    and repairs the accounts already affected.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Early-arrival buffer
-- -----------------------------------------------------------------------------
alter table public.doctor_settings
  add column if not exists arrival_buffer_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'doctor_settings_arrival_buffer_range'
      and conrelid = 'public.doctor_settings'::regclass
  ) then
    alter table public.doctor_settings
      add constraint doctor_settings_arrival_buffer_range
      check (arrival_buffer_minutes between 0 and 120);
  end if;
end;
$$;

comment on column public.doctor_settings.arrival_buffer_minutes is
  'Minutes before the real slot that patients are told to arrive (patient-facing times only). 0 = off.';

-- Patient-facing arrival time for a booking.
create or replace function public._patient_arrival_at(p_scheduled_start timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_scheduled_start - make_interval(mins => coalesce(
    (select ds.arrival_buffer_minutes from public.doctor_settings ds where ds.id = 1), 0))
$$;

-- Reminder copy: "your arrival time" (the buffered time), not the slot time.
create or replace function public._wa_appointment_message(p_locale text, p_name text, p_clinic text, p_day text, p_time text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then format(
      E'Hello %s, a reminder of your arrival time at %s %s at %s. Please be at the clinic on time to confirm your turn.\n\nIf you can''t make it, please cancel it from your account or tell the secretary so another visitor can take the slot.',
      p_name, p_clinic, p_day, p_time)
    else format(
      E'مرحبًا %s، نذكّركِ بموعد حضوركِ في %s %s الساعة %s. نرجو الالتزام بالموعد لتأكيد دوركِ.\n\nإذا تعذّر عليكِ الحضور، يُرجى إلغاء الموعد من حسابكِ أو إخبار السكرتيرة لإتاحة الفرصة لحالة أخرى.',
      p_name, p_clinic, p_day, p_time)
  end
$$;

create or replace function public._wa_soon_message(p_locale text, p_clinic text, p_map_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then format('Hello, your arrival time at %s is in 30 minutes. Please make your way to the clinic.', p_clinic)
    else format('أهلاً بحضرتك يا فندم، متبقي 30 دقيقة على موعد حضورك في %s. نرجو التواجد في العيادة.', p_clinic)
  end || coalesce(E'\n' || nullif(btrim(p_map_url), ''), '')
$$;

-- Appointment reminder row: same as 0014, with the patient-facing arrival time.
create or replace function public._insert_appointment_reminder(
  p_appointment_id uuid,
  p_channel        public.notification_channel
)
returns setof public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := public._clinic_timezone();
begin
  return query
  insert into public.notification_logs
    (idempotency_key, appointment_id, patient_id, channel, template_key,
     recipient_phone, message_body, locale, template_params, status, expected_start_at)
  select
    'appointment_reminder:' || a.id,
    a.id, a.patient_id, p_channel, 'appointment_reminder',
    p.normalized_phone,
    public._wa_appointment_message(
      p.preferred_locale,
      public._wa_first_name(p.full_name),
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      public._wa_when_label(a.clinic_date, p.preferred_locale),
      public._wa_time12(public._patient_arrival_at(a.scheduled_start), v_tz, p.preferred_locale)),
    p.preferred_locale,
    jsonb_build_array(
      public._wa_first_name(p.full_name),
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      public._wa_when_label(a.clinic_date, p.preferred_locale),
      public._wa_time12(public._patient_arrival_at(a.scheduled_start), v_tz, p.preferred_locale)),
    'pending', a.scheduled_start
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  cross join public.doctor_settings ds
  where a.id = p_appointment_id
    and ds.id = 1
  on conflict (idempotency_key) do nothing
  returning *;
end;
$$;

-- 30 minutes before the patient-facing arrival time, while she has not checked in.
create or replace function public.enqueue_pre_appointment_alerts(
  p_channel public.notification_channel default 'whatsapp_link'
)
returns setof public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into public.notification_logs
    (idempotency_key, appointment_id, patient_id, channel, template_key,
     recipient_phone, message_body, locale, template_params, status, expected_start_at)
  select
    'appointment_soon:' || a.id,
    a.id, a.patient_id, p_channel, 'appointment_soon',
    p.normalized_phone,
    public._wa_soon_message(
      p.preferred_locale,
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      ds.clinic_map_url),
    p.preferred_locale,
    jsonb_build_array(
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      coalesce(ds.clinic_map_url, '')),
    'pending', a.scheduled_start
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  cross join public.doctor_settings ds
  where ds.id = 1
    and a.clinic_date = public.clinic_today()
    and a.status = 'scheduled'
    and a.scheduled_start - make_interval(mins => ds.arrival_buffer_minutes) > now()
    and a.scheduled_start - make_interval(mins => ds.arrival_buffer_minutes) <= now() + interval '30 minutes'
    and p.is_active
  on conflict (idempotency_key) do nothing
  returning *;
end;
$$;

revoke execute on function public._patient_arrival_at(timestamptz) from public, anon, authenticated;
revoke execute on function public.enqueue_pre_appointment_alerts(public.notification_channel) from public, anon, authenticated;
grant  execute on function public.enqueue_pre_appointment_alerts(public.notification_channel) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Secretary accounts saved as patients
-- -----------------------------------------------------------------------------
-- When the service role sets app_metadata.role = 'secretary' on a user whose
-- profile is still the default 'patient' (and who has no patient record),
-- promote the profile. app_metadata is writable only by the service role, so
-- this cannot be used for self-escalation.
create or replace function public.sync_staff_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_app_meta_data ->> 'role' = 'secretary'
     and (old.raw_app_meta_data ->> 'role') is distinct from 'secretary' then
    update public.profiles pr
       set role      = 'secretary',
           is_active = coalesce((new.raw_app_meta_data ->> 'is_active')::boolean, true),
           email     = coalesce(pr.email, nullif(lower(new.email), ''))
     where pr.id = new.id
       and pr.role = 'patient'
       and not exists (select 1 from public.patients pt where pt.auth_user_id = new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_staff_role_from_app_metadata() from public, anon, authenticated;

drop trigger if exists on_auth_user_app_metadata_updated on auth.users;
create trigger on_auth_user_app_metadata_updated
  after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_staff_role_from_app_metadata();

-- Repair: secretary accounts created while the bug was live.
update public.profiles pr
   set role      = 'secretary',
       is_active = coalesce((u.raw_app_meta_data ->> 'is_active')::boolean, true),
       email     = coalesce(pr.email, nullif(lower(u.email), ''))
  from auth.users u
 where u.id = pr.id
   and u.raw_app_meta_data ->> 'role' = 'secretary'
   and pr.role = 'patient'
   and not exists (select 1 from public.patients pt where pt.auth_user_id = pr.id);

commit;

notify pgrst, 'reload schema';
