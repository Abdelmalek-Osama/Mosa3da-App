-- =============================================================================
-- Migration 0018: Doctor-defined visit reasons (add / delete)
--
-- The built-in reasons stay a Postgres enum (they are part of every booking,
-- walk-in and queue function signature). Reasons the doctor adds live here and
-- are booked as visit_reason = 'other' with visit_reason_details = the reason's
-- Arabic name, which every list already shows in place of "Other". So history
-- stays readable even after a custom reason is deleted, and nothing about the
-- booking functions changes. The appointment trigger applies its duration.
-- Built-in reasons are hidden (visit_reason_settings.is_active), never deleted.
-- =============================================================================

begin;

create table if not exists public.custom_visit_reasons (
  id                        uuid primary key default gen_random_uuid(),
  label_ar                  text not null check (char_length(btrim(label_ar)) between 2 and 80),
  label_en                  text check (label_en is null or char_length(btrim(label_en)) between 2 and 80),
  default_duration_minutes  integer not null check (default_duration_minutes between 5 and 180),
  is_active                 boolean not null default true,
  sort_order                integer not null default 100,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.profiles (id) on delete set null
);

create unique index if not exists custom_visit_reasons_label_ar_key on public.custom_visit_reasons (lower(btrim(label_ar)));

alter table public.custom_visit_reasons enable row level security;

drop policy if exists custom_visit_reasons_read on public.custom_visit_reasons;
create policy custom_visit_reasons_read on public.custom_visit_reasons
  for select to authenticated using (true);

drop policy if exists custom_visit_reasons_doctor_write on public.custom_visit_reasons;
create policy custom_visit_reasons_doctor_write on public.custom_visit_reasons
  for all to authenticated using (public.is_doctor()) with check (public.is_doctor());

grant select, insert, update, delete on public.custom_visit_reasons to authenticated;

-- Same as 0015, plus: an 'other' booking whose details name an active custom
-- reason takes that reason's duration.
create or replace function public.appointments_apply_reason_duration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.visit_reason_settings;
  v_custom  public.custom_visit_reasons;
  v_minutes integer;
begin
  if new.visit_reason = 'other' and nullif(btrim(new.visit_reason_details), '') is not null then
    select * into v_custom from public.custom_visit_reasons
    where is_active
      and (lower(btrim(label_ar)) = lower(btrim(new.visit_reason_details))
           or lower(btrim(coalesce(label_en, ''))) = lower(btrim(new.visit_reason_details)))
    limit 1;
  end if;

  if v_custom.id is not null then
    v_minutes := v_custom.default_duration_minutes;
  else
    select * into v_setting from public.visit_reason_settings where reason = new.visit_reason;
    if v_setting.reason is null then
      return new;
    end if;
    if not v_setting.is_active then
      raise exception 'This visit reason is not available' using errcode = 'MQ422';
    end if;
    v_minutes := v_setting.default_duration_minutes;
  end if;

  new.duration_minutes := v_minutes;
  if new.scheduled_start is not null then
    new.scheduled_end := new.scheduled_start + make_interval(mins => v_minutes);
  end if;
  return new;
end;
$$;

commit;
