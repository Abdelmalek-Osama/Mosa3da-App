-- =============================================================================
-- Migration 0015: Reasons for visit with default durations (P3-19)
--
-- The doctor configures, per visit reason, the expected consultation length,
-- whether reception and the portal offer it, and its order. Reception no
-- longer picks a duration by hand: every new appointment takes the duration of
-- its reason (trigger below), walk-ins look it up in the app, and the queue
-- engine and lobby ETAs use it from there. Staff can still adjust one visit's
-- duration from the queue.
-- =============================================================================

begin;

create table if not exists public.visit_reason_settings (
  reason                    public.visit_reason primary key,
  default_duration_minutes  integer not null check (default_duration_minutes between 5 and 180),
  is_active                 boolean not null default true,
  sort_order                integer not null default 0,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null
);

insert into public.visit_reason_settings (reason, default_duration_minutes, sort_order) values
  ('pregnancy_follow_up',    20, 1),
  ('routine_antenatal',      20, 2),
  ('pregnancy_confirmation', 20, 3),
  ('ultrasound',             15, 4),
  ('ultrasound_4d',          30, 5),
  ('gynecology',             30, 6),
  ('postpartum',             20, 7),
  ('other',                  20, 8)
on conflict (reason) do nothing;

alter table public.visit_reason_settings enable row level security;

drop policy if exists visit_reason_settings_read on public.visit_reason_settings;
create policy visit_reason_settings_read on public.visit_reason_settings
  for select to authenticated using (true);

drop policy if exists visit_reason_settings_doctor_update on public.visit_reason_settings;
create policy visit_reason_settings_doctor_update on public.visit_reason_settings
  for update to authenticated using (public.is_doctor()) with check (public.is_doctor());

grant select, update on public.visit_reason_settings to authenticated;

-- New appointments take the configured duration of their reason; hidden
-- reasons can no longer be booked.
create or replace function public.appointments_apply_reason_duration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.visit_reason_settings;
begin
  select * into v_setting from public.visit_reason_settings where reason = new.visit_reason;
  if v_setting.reason is null then
    return new;
  end if;
  if not v_setting.is_active then
    raise exception 'This visit reason is not available' using errcode = 'MQ422';
  end if;
  new.duration_minutes := v_setting.default_duration_minutes;
  if new.scheduled_start is not null then
    new.scheduled_end := new.scheduled_start + make_interval(mins => v_setting.default_duration_minutes);
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_apply_reason_duration on public.appointments;
create trigger appointments_apply_reason_duration
  before insert on public.appointments
  for each row execute function public.appointments_apply_reason_duration();

commit;
