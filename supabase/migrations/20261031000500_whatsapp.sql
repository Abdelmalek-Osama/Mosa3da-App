-- =============================================================================
-- Mosa3da — Migration 0006: WhatsApp reminders and patient language
--
-- * patients.preferred_locale: messages are written in the patient's language.
-- * notification_logs gains locale, template_params (ordered values for Meta
--   templates) and opened_at / opened_by for one-tap links sent by staff.
-- * enqueue_due_notifications(channel)      : "your turn is coming up" (cron + queue changes)
-- * enqueue_appointment_reminders(channel)  : day-before reminders for patients with an account
-- * queue_appointment_reminder(id, channel) : staff "WhatsApp reminder" button
-- * mark_notification_opened(id)            : staff opened the wa.me link (NOT proof it was sent)
-- =============================================================================

begin;

alter table public.patients
  add column if not exists preferred_locale text not null default 'ar'
    check (preferred_locale in ('ar', 'en'));

alter table public.notification_logs
  add column if not exists locale          text not null default 'ar' check (locale in ('ar', 'en')),
  add column if not exists template_params jsonb not null default '[]'::jsonb
    check (jsonb_typeof(template_params) = 'array'),
  add column if not exists opened_at       timestamptz,
  add column if not exists opened_by       uuid references public.profiles (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Message text. Arabic is Modern Standard Arabic addressed to a woman (OB/GYN).
-- template_params follow the order of the Meta templates in docs/whatsapp.md.
-- -----------------------------------------------------------------------------
create or replace function public._wa_first_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select split_part(btrim(p_full_name), ' ', 1)
$$;

create or replace function public._wa_day_label(p_date date, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then to_char(p_date, 'FMDay DD Mon YYYY')
    else (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from p_date)::int + 1]
         || ' ' || to_char(p_date, 'DD/MM/YYYY')
  end
$$;

create or replace function public._wa_turn_message(p_locale text, p_name text, p_time text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then format(
      'Hello %s, your consultation is approaching. Your expected consultation time is %s. Please proceed to the clinic.',
      p_name, p_time)
    else format(
      'مرحبًا %s، اقترب موعد دخولكِ. الوقت المتوقع لدخولكِ %s. يُرجى التوجّه إلى العيادة.',
      p_name, p_time)
  end
$$;

create or replace function public._wa_appointment_message(p_locale text, p_name text, p_clinic text, p_day text, p_time text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then format(
      'Hello %s, this is a reminder of your appointment at %s on %s at %s. If you can''t make it, please cancel it from your patient account.',
      p_name, p_clinic, p_day, p_time)
    else format(
      'مرحبًا %s، نذكّركِ بموعدكِ في %s يوم %s الساعة %s. إذا تعذّر عليكِ الحضور، يُرجى إلغاء الموعد من حسابكِ.',
      p_name, p_clinic, p_day, p_time)
  end
$$;

-- -----------------------------------------------------------------------------
-- Turn approaching (replaces the 0002 version, which took no channel).
-- -----------------------------------------------------------------------------
drop function if exists public.enqueue_due_notifications();

create or replace function public.enqueue_due_notifications(
  p_channel public.notification_channel default 'whatsapp_link'
)
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
     recipient_phone, message_body, locale, template_params, status, expected_start_at, threshold_minutes)
  select
    'consultation_approaching:' || q.id,
    q.id, q.appointment_id, q.patient_id, p_channel, 'consultation_approaching',
    p.normalized_phone,
    public._wa_turn_message(p.preferred_locale, public._wa_first_name(p.full_name),
                            to_char(q.expected_start_at at time zone v_tz, 'HH24:MI')),
    p.preferred_locale,
    jsonb_build_array(public._wa_first_name(p.full_name), to_char(q.expected_start_at at time zone v_tz, 'HH24:MI')),
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

-- -----------------------------------------------------------------------------
-- Shared builder for one appointment reminder row (no permission checks).
-- -----------------------------------------------------------------------------
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
      public._wa_day_label(a.clinic_date, p.preferred_locale),
      to_char(a.scheduled_start at time zone v_tz, 'HH24:MI')),
    p.preferred_locale,
    jsonb_build_array(
      public._wa_first_name(p.full_name),
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      public._wa_day_label(a.clinic_date, p.preferred_locale),
      to_char(a.scheduled_start at time zone v_tz, 'HH24:MI')),
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

-- Cron: reminders for the given day (default: tomorrow) for patients who have
-- a portal account. Idempotent per appointment.
create or replace function public.enqueue_appointment_reminders(
  p_channel  public.notification_channel default 'whatsapp_link',
  p_for_date date default null
)
returns setof public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_for_date, public.clinic_today() + 1);
  v_id   uuid;
begin
  for v_id in
    select a.id
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    where a.clinic_date = v_date
      and a.status = 'scheduled'
      and a.scheduled_start is not null
      and a.scheduled_start > now()
      and p.is_active
      and p.auth_user_id is not null
    order by a.scheduled_start
  loop
    return query select * from public._insert_appointment_reminder(v_id, p_channel);
  end loop;
end;
$$;

-- Staff: create (or return the existing) reminder for one appointment.
create or replace function public.queue_appointment_reminder(
  p_appointment_id uuid,
  p_channel        public.notification_channel default 'whatsapp_link'
)
returns public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.appointment_status;
  v_row    public.notification_logs;
begin
  perform public._require_staff();

  select status into v_status from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Only scheduled appointments can get a reminder' using errcode = '22023';
  end if;

  select * into v_row from public._insert_appointment_reminder(p_appointment_id, p_channel);
  if v_row.id is null then
    select * into v_row from public.notification_logs
    where idempotency_key = 'appointment_reminder:' || p_appointment_id;
  end if;
  return v_row;
end;
$$;

-- Staff opened the one-tap link. Recorded as "opened", never as "sent":
-- the message leaves only if they press Send inside WhatsApp.
create or replace function public.mark_notification_opened(p_id uuid)
returns public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._require_staff();
  v_row   public.notification_logs;
begin
  update public.notification_logs
     set opened_at = now(), opened_by = v_actor
   where id = p_id and channel = 'whatsapp_link'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reminder not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create index if not exists notification_logs_channel_status_idx
  on public.notification_logs (channel, status, created_at);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function public._wa_first_name(text)                                    from public, anon, authenticated;
revoke execute on function public._wa_day_label(date, text)                               from public, anon, authenticated;
revoke execute on function public._wa_turn_message(text, text, text)                      from public, anon, authenticated;
revoke execute on function public._wa_appointment_message(text, text, text, text, text)   from public, anon, authenticated;
revoke execute on function public._insert_appointment_reminder(uuid, public.notification_channel) from public, anon, authenticated;
revoke execute on function public.enqueue_due_notifications(public.notification_channel) from public, anon, authenticated;
revoke execute on function public.enqueue_appointment_reminders(public.notification_channel, date) from public, anon, authenticated;

revoke execute on function public.queue_appointment_reminder(uuid, public.notification_channel) from public, anon;
revoke execute on function public.mark_notification_opened(uuid)                          from public, anon;
grant  execute on function public.queue_appointment_reminder(uuid, public.notification_channel) to authenticated;
grant  execute on function public.mark_notification_opened(uuid)                          to authenticated;

grant execute on function public.enqueue_due_notifications(public.notification_channel)          to service_role;
grant execute on function public.enqueue_appointment_reminders(public.notification_channel, date) to service_role;

commit;
