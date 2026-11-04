-- =============================================================================
-- Migration 0013: Lobby TV (P2-13 .. P2-16, P1-06 on the TV)
--
-- get_display_board (public, read-only) now returns:
--   * full Arabic triple name + optional English name per card (the clinic
--     asked for full names on the lobby screen; still no phone numbers, notes
--     or visit reasons),
--   * LIVE expected times: same projection as _recalculate_queue evaluated at
--     read time (anchor = max(current end, now) or max(session open, now), plus
--     the durations ahead), so the TV never shows an ETA in the past,
--   * today's online bookings that have not checked in yet (slot start/end),
--   * clinic.bilingual: the TV layout chosen by staff (Arabic only by default).
-- set_display_bilingual(boolean) lets doctor or secretary switch the TV layout.
-- =============================================================================

begin;

alter table public.doctor_settings
  add column if not exists display_bilingual boolean not null default false;

create or replace function public.set_display_bilingual(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_staff();
  update public.doctor_settings set display_bilingual = coalesce(p_on, false) where id = 1;
  return coalesce(p_on, false);
end;
$$;

revoke execute on function public.set_display_bilingual(boolean) from public, anon;
grant execute on function public.set_display_bilingual(boolean) to authenticated;

create or replace function public.get_display_board()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.clinic_sessions where clinic_date = public.clinic_today()
  ),
  q as (
    select qe.id, qe.queue_number, qe.status, qe.position, qe.created_at, qe.started_at,
           qe.estimated_duration_minutes,
           p.full_name as name_ar, p.full_name_en as name_en
    from public.queue_entries qe
    join s on s.id = qe.session_id
    join public.patients p on p.id = qe.patient_id
    where qe.status in ('current', 'ready', 'arrived', 'late')
      and qe.missed_turn_at is null
  ),
  anchor as (
    select coalesce(
      (select greatest(c.started_at + make_interval(mins => c.estimated_duration_minutes), now())
         from q c where c.status = 'current'),
      greatest((select opens_at from s), now()),
      now()
    ) as at
  ),
  eligible as (
    select q.*,
           (select at from anchor) + make_interval(mins => coalesce(sum(q.estimated_duration_minutes) over (
             order by (q.status = 'ready') desc, q.position, q.created_at, q.id
             rows between unbounded preceding and 1 preceding), 0)::integer) as eta
    from q
    where q.status in ('ready', 'arrived', 'late')
  ),
  booked as (
    select a.scheduled_start, a.scheduled_end, p.full_name as name_ar, p.full_name_en as name_en, a.id
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    where a.clinic_date = public.clinic_today()
      and a.status = 'scheduled'
      and a.scheduled_start is not null
  )
  select jsonb_build_object(
    'clinic', (select jsonb_build_object(
                 'name', ds.clinic_name, 'name_ar', ds.clinic_name_ar,
                 'doctor', ds.doctor_display_name, 'timezone', ds.timezone,
                 'bilingual', ds.display_bilingual)
               from public.doctor_settings ds where ds.id = 1),
    'session_open', exists (select 1 from s where s.status = 'open'),
    'current', (select jsonb_build_object('queue_number', queue_number, 'display_name', name_ar,
                                          'name_ar', name_ar, 'name_en', name_en, 'started_at', started_at)
                from q where status = 'current'),
    'next',    (select jsonb_build_object('queue_number', queue_number, 'display_name', name_ar,
                                          'name_ar', name_ar, 'name_en', name_en, 'expected_start_at', eta)
                from eligible where status = 'ready'),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object(
                           'queue_number', queue_number, 'display_name', name_ar,
                           'name_ar', name_ar, 'name_en', name_en,
                           'expected_start_at', eta, 'is_late', status = 'late')
                         order by eta, position, created_at, id)
                         from eligible where status in ('arrived', 'late')), '[]'::jsonb),
    'booked',  coalesce((select jsonb_agg(jsonb_build_object(
                           'name_ar', name_ar, 'name_en', name_en,
                           'slot_start', scheduled_start, 'slot_end', scheduled_end)
                         order by scheduled_start, id)
                         from booked), '[]'::jsonb),
    'generated_at', now()
  );
$$;

commit;
