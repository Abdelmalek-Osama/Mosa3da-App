-- =============================================================================
-- Migration 0014: WhatsApp copy (P2-17) and the 30-minute alert (P2-18)
--
-- P2-17: reminders use 12-hour times (04:10 مساءً / 4:10 PM) and say "اليوم"
--        (today) instead of the full date for same-day appointments, with the
--        clinic's wording. The turn alert also uses 12-hour time.
-- P2-18: enqueue_pre_appointment_alerts() queues one WhatsApp alert per booking
--        30 minutes before its time while the visitor has not checked in yet.
--        Same channels as other reminders: sent automatically in paid mode,
--        one-tap wa.me for staff in free mode. Idempotent per appointment.
-- =============================================================================

begin;

-- 12-hour clinic time: "04:10 مساءً" / "4:10 PM".
create or replace function public._wa_time12(p_at timestamptz, p_tz text, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_locale = 'en' then to_char(p_at at time zone p_tz, 'FMHH12:MI AM')
    else to_char(p_at at time zone p_tz, 'HH12:MI') || ' ' ||
         case when extract(hour from p_at at time zone p_tz) < 12 then 'صباحًا' else 'مساءً' end
  end
$$;

-- "اليوم" / "today" for the clinic's today, otherwise "يوم الثلاثاء 03/11" / "on Tuesday 03 Nov".
create or replace function public._wa_when_label(p_date date, p_locale text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_date = public.clinic_today() then case when p_locale = 'en' then 'today' else 'اليوم' end
    when p_locale = 'en' then 'on ' || to_char(p_date, 'FMDay DD Mon')
    else 'يوم ' || (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from p_date)::int + 1]
         || ' ' || to_char(p_date, 'DD/MM')
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
      E'Hello %s, a reminder of your appointment at %s %s at %s. Please be at the clinic to confirm your turn.\n\nIf you can''t make it, please cancel it from your account or tell the secretary so another visitor can take the slot.',
      p_name, p_clinic, p_day, p_time)
    else format(
      E'مرحبًا %s، نذكّركِ بموعد كشفكِ في %s %s الساعة %s. نرجو التواجد في العيادة لتأكيد دوركِ.\n\nإذا تعذّر عليكِ الحضور، يُرجى إلغاء الموعد من حسابكِ أو إخبار السكرتيرة لإتاحة الفرصة لحالة أخرى.',
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
    when p_locale = 'en' then format('Hello, your appointment at %s is in 30 minutes. Please make your way to the clinic.', p_clinic)
    else format('أهلاً بحضرتك يا فندم، متبقي 30 دقيقة على موعد كشفك في %s. نرجو التواجد للعيادة.', p_clinic)
  end || coalesce(E'\n' || nullif(btrim(p_map_url), ''), '')
$$;

-- Turn approaching: same as 0006, with 12-hour time.
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
                            public._wa_time12(q.expected_start_at, v_tz, p.preferred_locale)),
    p.preferred_locale,
    jsonb_build_array(public._wa_first_name(p.full_name), public._wa_time12(q.expected_start_at, v_tz, p.preferred_locale)),
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

-- Appointment reminder row: same as 0006, with "اليوم" / 12-hour time.
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
      public._wa_time12(a.scheduled_start, v_tz, p.preferred_locale)),
    p.preferred_locale,
    jsonb_build_array(
      public._wa_first_name(p.full_name),
      case when p.preferred_locale = 'en' then ds.clinic_name else ds.clinic_name_ar end,
      public._wa_when_label(a.clinic_date, p.preferred_locale),
      public._wa_time12(a.scheduled_start, v_tz, p.preferred_locale)),
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

-- P2-18: 30 minutes before a booking, while she has not checked in yet.
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
    and a.scheduled_start > now()
    and a.scheduled_start <= now() + interval '30 minutes'
    and p.is_active
  on conflict (idempotency_key) do nothing
  returning *;
end;
$$;

revoke execute on function public._wa_time12(timestamptz, text, text)                     from public, anon, authenticated;
revoke execute on function public._wa_when_label(date, text)                               from public, anon, authenticated;
revoke execute on function public._wa_soon_message(text, text, text)                        from public, anon, authenticated;
revoke execute on function public.enqueue_pre_appointment_alerts(public.notification_channel) from public, anon, authenticated;
grant  execute on function public.enqueue_pre_appointment_alerts(public.notification_channel) to service_role;

commit;
