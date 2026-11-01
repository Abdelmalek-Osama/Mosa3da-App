-- =============================================================================
-- Mosa3da (مساعدة) — Clinic Management POC
-- Migration 0001: Core schema, constraints, helper functions, triggers, RLS
--
-- Source of truth for the database. prisma/schema.prisma is a typed mirror only.
--
-- Conventions
--   * All timestamps are timestamptz stored in UTC.
--   * "Clinic dates" (date columns) are calendar days in doctor_settings.timezone.
--   * Weekdays: 0 = Sunday ... 6 = Saturday (matches JS Date#getDay and
--     PostgreSQL extract(dow)).
--   * Phone numbers are stored in E.164 (e.g. +201001234567).
--   * Critical queue mutations go through SECURITY DEFINER RPCs (migration 0002),
--     never through direct client-side UPDATEs on queue_entries.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto   with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm    with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('doctor', 'secretary', 'patient');

create type public.queue_status as enum (
  'scheduled',  -- booked, not checked in (holds no active position)
  'arrived',    -- physically in the clinic, waiting
  'ready',      -- next eligible patient (at most one per session)
  'current',    -- consulting now (at most one per session)
  'late',       -- missed turn, moved to the end of the eligible queue
  'finished',   -- consultation completed
  'cancelled'   -- removed from the queue
);

create type public.appointment_status as enum (
  'scheduled',
  'checked_in',
  'completed',
  'cancelled',
  'no_show'
);

create type public.appointment_source as enum ('patient_portal', 'staff', 'walk_in');

create type public.visit_reason as enum (
  'pregnancy_confirmation',
  'routine_antenatal',
  'pregnancy_follow_up',
  'ultrasound',
  'ultrasound_4d',
  'postpartum',
  'gynecology',
  'other'
);

create type public.clinic_session_status as enum ('planned', 'open', 'closed');

create type public.queue_event_type as enum (
  'created',
  'status_changed',
  'missed_turn',
  'late_policy_cancelled',
  'late_policy_applied',
  'reordered',
  'duration_changed'
);

create type public.otp_purpose as enum ('patient_registration', 'password_reset');

create type public.notification_channel as enum ('whatsapp_simulated', 'whatsapp');

create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');

-- Range over time-of-day, used to forbid overlapping working periods.
create type public.timerange as range (subtype = time);

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalizes Egyptian / international numbers to E.164.
--   01001234567     -> +201001234567
--   201001234567    -> +201001234567
--   00201001234567  -> +201001234567
--   +20 100 123 4567-> +201001234567
-- Returns NULL when the input cannot be normalized.
create or replace function public.normalize_phone(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_has_plus boolean := btrim(coalesce(p_raw, '')) like '+%';
  v_digits   text    := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
begin
  if v_digits = '' then
    return null;
  end if;

  if not v_has_plus then
    if v_digits like '00%' then
      v_digits := substr(v_digits, 3);
    elsif v_digits ~ '^01[0125][0-9]{8}$' then
      v_digits := '2' || v_digits;          -- Egyptian local mobile
    end if;
  end if;

  if v_digits !~ '^[1-9][0-9]{7,14}$' then
    return null;
  end if;

  return '+' || v_digits;
end;
$$;

-- Masks a full name for public displays: "Mariam Ahmed Hassan" -> "Mariam A."
create or replace function public.mask_patient_name(p_full_name text)
returns text
language sql
immutable
as $$
  select case
    when p_full_name is null or btrim(p_full_name) = '' then 'Patient'
    when array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1) = 1
      then (regexp_split_to_array(btrim(p_full_name), '\s+'))[1]
    else (regexp_split_to_array(btrim(p_full_name), '\s+'))[1] || ' ' ||
         left((regexp_split_to_array(btrim(p_full_name), '\s+'))[2], 1) || '.'
  end;
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user. Holds the authoritative role.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role not null default 'patient',
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 120),
  email       text check (email is null or email = lower(email)),
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (email) where email is not null;
create index profiles_role_idx on public.profiles (role) where is_active;

-- Exactly one doctor (single-clinic POC).
create unique index profiles_single_doctor_key on public.profiles (role) where role = 'doctor';

-- -----------------------------------------------------------------------------
-- patients: clinical identity. A walk-in may exist without an auth account.
-- -----------------------------------------------------------------------------
create table public.patients (
  id                 uuid primary key default gen_random_uuid(),
  auth_user_id       uuid unique references auth.users (id) on delete set null,
  full_name          text not null check (char_length(btrim(full_name)) between 2 and 120),
  normalized_phone   text not null unique check (normalized_phone ~ '^\+[1-9][0-9]{7,14}$'),
  email              text check (email is null or email = lower(email)),
  date_of_birth      date check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  phone_verified_at  timestamptz,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index patients_full_name_trgm_idx on public.patients using gin (full_name extensions.gin_trgm_ops);
create index patients_phone_trgm_idx     on public.patients using gin (normalized_phone extensions.gin_trgm_ops);
create index patients_created_at_idx     on public.patients (created_at desc);

-- -----------------------------------------------------------------------------
-- doctor_settings: singleton clinic configuration (id is always 1).
-- -----------------------------------------------------------------------------
create table public.doctor_settings (
  id                            smallint primary key default 1 check (id = 1),
  doctor_profile_id             uuid references public.profiles (id) on delete set null,
  clinic_name                   text not null default 'Mosa3da Clinic',
  clinic_name_ar                text not null default 'عيادة مساعدة',
  doctor_display_name           text not null default 'Dr. Clinic Doctor',
  timezone                      text not null default 'Africa/Cairo',
  default_consultation_minutes  integer not null default 20 check (default_consultation_minutes between 5 and 180),
  whatsapp_threshold_minutes    integer not null default 30 check (whatsapp_threshold_minutes between 5 and 240),
  late_policy_consultations     integer not null default 2  check (late_policy_consultations between 1 and 10),
  booking_horizon_days          integer not null default 30 check (booking_horizon_days between 1 and 365),
  cancellation_cutoff_minutes   integer not null default 120 check (cancellation_cutoff_minutes between 0 and 10080),
  slot_interval_minutes         integer not null default 20 check (slot_interval_minutes between 5 and 120),
  updated_by                    uuid references public.profiles (id) on delete set null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create or replace function public.validate_doctor_settings_timezone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- clinic_working_days: recurring weekly working periods (multiple per day OK).
-- -----------------------------------------------------------------------------
create table public.clinic_working_days (
  id          uuid primary key default gen_random_uuid(),
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clinic_working_days_time_order check (end_time > start_time),
  constraint clinic_working_days_no_overlap exclude using gist (
    weekday with =,
    public.timerange(start_time, end_time, '[)') with &&
  ) where (is_active)
);

create index clinic_working_days_weekday_idx on public.clinic_working_days (weekday) where is_active;

-- -----------------------------------------------------------------------------
-- clinic_sessions: one operational queue per clinic date.
-- -----------------------------------------------------------------------------
create table public.clinic_sessions (
  id                              uuid primary key default gen_random_uuid(),
  clinic_date                     date not null unique,
  opens_at                        timestamptz not null,
  closes_at                       timestamptz not null,
  status                          public.clinic_session_status not null default 'planned',
  actual_started_at               timestamptz,
  closed_at                       timestamptz,
  next_queue_number               integer not null default 1 check (next_queue_number >= 1),
  -- Monotonic counter of finished consultations. The late policy compares
  -- against a snapshot of this counter, so no timers are involved.
  finished_consultations_count    integer not null default 0 check (finished_consultations_count >= 0),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint clinic_sessions_time_order check (closes_at > opens_at),
  constraint clinic_sessions_closed_consistency check ((status = 'closed') = (closed_at is not null)),
  constraint clinic_sessions_id_date_key unique (id, clinic_date)
);

-- -----------------------------------------------------------------------------
-- appointments: bookings (future or today). Separate from queue participation.
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients (id) on delete restrict,
  clinic_date           date not null,
  scheduled_start       timestamptz,
  scheduled_end         timestamptz,
  duration_minutes      integer not null default 20 check (duration_minutes between 5 and 180),
  visit_reason          public.visit_reason not null,
  visit_reason_details  text check (visit_reason_details is null or char_length(visit_reason_details) <= 200),
  patient_notes         text check (patient_notes is null or char_length(patient_notes) <= 1000),
  consultation_notes    text check (consultation_notes is null or char_length(consultation_notes) <= 5000),
  status                public.appointment_status not null default 'scheduled',
  source                public.appointment_source not null,
  booked_by             uuid references public.profiles (id) on delete set null,
  checked_in_at         timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references public.profiles (id) on delete set null,
  cancellation_reason   text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Booked appointments need a slot; walk-ins are queue-ordered and may have none.
  constraint appointments_slot_required check (
    source = 'walk_in' or (scheduled_start is not null and scheduled_end is not null)
  ),
  constraint appointments_slot_pair check ((scheduled_start is null) = (scheduled_end is null)),
  constraint appointments_slot_order check (scheduled_end is null or scheduled_end > scheduled_start),
  constraint appointments_other_reason_details check (visit_reason <> 'other' or visit_reason_details is not null),
  constraint appointments_cancelled_consistency check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint appointments_completed_consistency check ((status = 'completed') = (completed_at is not null)),
  constraint appointments_checked_in_consistency check (
    status not in ('checked_in', 'completed') or checked_in_at is not null
  ),

  -- No two active booked appointments may overlap in time.
  constraint appointments_no_slot_overlap exclude using gist (
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status in ('scheduled', 'checked_in') and scheduled_start is not null)
);

-- A patient may hold at most one active appointment per clinic day.
create unique index appointments_one_active_per_patient_day
  on public.appointments (patient_id, clinic_date)
  where status in ('scheduled', 'checked_in');

create index appointments_clinic_date_idx on public.appointments (clinic_date, scheduled_start);
create index appointments_patient_idx     on public.appointments (patient_id, clinic_date desc);
create index appointments_status_idx      on public.appointments (status, clinic_date);

-- -----------------------------------------------------------------------------
-- queue_entries: a patient's participation in one clinic-day queue.
-- -----------------------------------------------------------------------------
create table public.queue_entries (
  id                              uuid primary key default gen_random_uuid(),
  session_id                      uuid not null,
  clinic_date                     date not null,
  patient_id                      uuid not null references public.patients (id) on delete restrict,
  appointment_id                  uuid unique references public.appointments (id) on delete set null,
  queue_number                    integer check (queue_number is null or queue_number >= 1),
  position                        integer check (position is null or position >= 1),
  visit_reason                    public.visit_reason not null,
  estimated_duration_minutes      integer not null default 20 check (estimated_duration_minutes between 5 and 180),
  expected_start_at               timestamptz,
  status                          public.queue_status not null default 'arrived',
  arrived_at                      timestamptz,
  ready_at                        timestamptz,
  started_at                      timestamptz,
  finished_at                     timestamptz,
  cancelled_at                    timestamptz,
  late_at                         timestamptz,
  -- Late policy tracking (explicit fields, no timers):
  --   missed_turn_at           when staff marked the Ready patient absent
  --   missed_turn_baseline     clinic_sessions.finished_consultations_count at that moment
  -- The patient becomes Late once count >= baseline + late_policy_consultations
  -- while still absent. The consultation that caused the miss finished BEFORE the
  -- snapshot, so it is never counted.
  missed_turn_at                  timestamptz,
  missed_turn_baseline            integer check (missed_turn_baseline is null or missed_turn_baseline >= 0),
  staff_notes                     text check (staff_notes is null or char_length(staff_notes) <= 1000),
  version                         integer not null default 1,
  created_by                      uuid references public.profiles (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint queue_entries_session_fk foreign key (session_id, clinic_date)
    references public.clinic_sessions (id, clinic_date) on delete cascade,

  -- Scheduled entries do not consume active positions / numbers.
  constraint queue_entries_position_required check (
    status = 'scheduled' or (queue_number is not null and position is not null)
  ),
  constraint queue_entries_scheduled_has_no_position check (
    status <> 'scheduled' or (queue_number is null and position is null and appointment_id is not null)
  ),
  constraint queue_entries_current_started check (status <> 'current' or started_at is not null),
  constraint queue_entries_finished_timestamps check (
    status <> 'finished' or (started_at is not null and finished_at is not null and finished_at >= started_at)
  ),
  constraint queue_entries_cancelled_timestamp check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint queue_entries_late_timestamp check (status <> 'late' or late_at is not null),
  constraint queue_entries_missed_turn_pair check ((missed_turn_at is null) = (missed_turn_baseline is null)),

  constraint queue_entries_session_number_key unique (session_id, queue_number),
  constraint queue_entries_session_position_key unique (session_id, position) deferrable initially deferred
);

-- Never two Current patients in one session.
create unique index queue_entries_single_current
  on public.queue_entries (session_id) where status = 'current';

-- Never two Ready patients in one session.
create unique index queue_entries_single_ready
  on public.queue_entries (session_id) where status = 'ready';

-- A patient appears at most once among active entries of a session.
create unique index queue_entries_patient_active_key
  on public.queue_entries (session_id, patient_id)
  where status not in ('finished', 'cancelled');

create index queue_entries_session_order_idx on public.queue_entries (session_id, position, created_at, id);
create index queue_entries_patient_idx       on public.queue_entries (patient_id, clinic_date desc);
create index queue_entries_missed_turn_idx   on public.queue_entries (session_id) where missed_turn_at is not null;

-- -----------------------------------------------------------------------------
-- queue_status_history: append-only audit of every queue transition.
-- -----------------------------------------------------------------------------
create table public.queue_status_history (
  id              bigint generated always as identity primary key,
  queue_entry_id  uuid not null references public.queue_entries (id) on delete cascade,
  session_id      uuid not null references public.clinic_sessions (id) on delete cascade,
  event_type      public.queue_event_type not null,
  from_status     public.queue_status,
  to_status       public.queue_status,
  actor_id        uuid references public.profiles (id) on delete set null, -- null = system
  reason          text check (reason is null or char_length(reason) <= 500),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index queue_status_history_entry_idx   on public.queue_status_history (queue_entry_id, created_at);
create index queue_status_history_session_idx on public.queue_status_history (session_id, created_at desc);

-- -----------------------------------------------------------------------------
-- otp_verifications: hashed one-time codes. Plaintext codes are never stored.
-- code_hash = hex(HMAC-SHA256(code, OTP_PEPPER)) computed on the server.
-- -----------------------------------------------------------------------------
create table public.otp_verifications (
  id                uuid primary key default gen_random_uuid(),
  normalized_phone  text not null check (normalized_phone ~ '^\+[1-9][0-9]{7,14}$'),
  purpose           public.otp_purpose not null,
  code_hash         text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  patient_id        uuid references public.patients (id) on delete cascade,
  auth_user_id      uuid references auth.users (id) on delete cascade,
  attempts          integer not null default 0 check (attempts >= 0),
  max_attempts      integer not null default 5 check (max_attempts between 1 and 10),
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint otp_verifications_attempts_cap check (attempts <= max_attempts),
  constraint otp_verifications_expiry_order check (expires_at > created_at)
);

-- Only one live (unconsumed) OTP per phone and purpose.
create unique index otp_verifications_one_active
  on public.otp_verifications (normalized_phone, purpose)
  where consumed_at is null;

create index otp_verifications_expires_idx on public.otp_verifications (expires_at);

-- -----------------------------------------------------------------------------
-- notification_logs: simulated (and future real) WhatsApp notifications.
-- idempotency_key guarantees repeated cron runs never duplicate a message.
-- -----------------------------------------------------------------------------
create table public.notification_logs (
  id                  uuid primary key default gen_random_uuid(),
  idempotency_key     text not null unique check (char_length(idempotency_key) between 8 and 200),
  queue_entry_id      uuid references public.queue_entries (id) on delete set null,
  appointment_id      uuid references public.appointments (id) on delete set null,
  patient_id          uuid not null references public.patients (id) on delete cascade,
  channel             public.notification_channel not null default 'whatsapp_simulated',
  template_key        text not null default 'consultation_approaching',
  recipient_phone     text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  message_body        text not null check (char_length(message_body) between 1 and 2000),
  status              public.notification_status not null default 'pending',
  expected_start_at   timestamptz,
  threshold_minutes   integer check (threshold_minutes is null or threshold_minutes between 1 and 1440),
  attempts            integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  error_message       text,
  sent_at             timestamptz,
  failed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint notification_logs_sent_consistency   check ((status = 'sent') = (sent_at is not null)),
  constraint notification_logs_failed_consistency check (status <> 'failed' or failed_at is not null)
);

create index notification_logs_status_idx  on public.notification_logs (status, created_at);
create index notification_logs_patient_idx on public.notification_logs (patient_id, created_at desc);
create index notification_logs_recent_idx  on public.notification_logs (created_at desc);

-- =============================================================================
-- AUTHORIZATION HELPERS (SECURITY DEFINER, fixed search_path)
-- =============================================================================

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_doctor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'doctor'
  )
$$;

-- Doctor or active secretary. Inactive secretaries are denied everywhere.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('doctor', 'secretary')
  )
$$;

create or replace function public.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pt.id
  from public.patients pt
  join public.profiles p on p.id = pt.auth_user_id
  where pt.auth_user_id = auth.uid() and pt.is_active and p.is_active
$$;

-- Clinic "today" in the configured timezone.
create or replace function public.clinic_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select ds.timezone from public.doctor_settings ds where ds.id = 1),
    'Africa/Cairo'
  ))::date
$$;

-- Converts a clinic-local date + time to a UTC timestamptz.
create or replace function public.clinic_local_to_utc(p_date date, p_time time)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_date + p_time) at time zone coalesce(
    (select ds.timezone from public.doctor_settings ds where ds.id = 1),
    'Africa/Cairo'
  )
$$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- updated_at maintenance
create trigger profiles_set_updated_at            before update on public.profiles            for each row execute function public.set_updated_at();
create trigger patients_set_updated_at            before update on public.patients            for each row execute function public.set_updated_at();
create trigger doctor_settings_set_updated_at     before update on public.doctor_settings     for each row execute function public.set_updated_at();
create trigger clinic_working_days_set_updated_at before update on public.clinic_working_days for each row execute function public.set_updated_at();
create trigger clinic_sessions_set_updated_at     before update on public.clinic_sessions     for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at        before update on public.appointments        for each row execute function public.set_updated_at();
create trigger notification_logs_set_updated_at   before update on public.notification_logs   for each row execute function public.set_updated_at();

create trigger doctor_settings_validate_timezone
  before insert or update of timezone on public.doctor_settings
  for each row execute function public.validate_doctor_settings_timezone();

-- Phone normalization on write
create or replace function public.patients_normalize_phone()
returns trigger
language plpgsql
as $$
declare
  v_normalized text := public.normalize_phone(new.normalized_phone);
begin
  if v_normalized is null then
    raise exception 'Invalid phone number: %', new.normalized_phone using errcode = '22023';
  end if;
  new.normalized_phone := v_normalized;
  new.email := nullif(lower(btrim(new.email)), '');
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger patients_normalize_phone
  before insert or update of normalized_phone, email, full_name on public.patients
  for each row execute function public.patients_normalize_phone();

-- Privilege guard: only the doctor (or trusted server roles) may change roles,
-- activation status, or create staff via direct writes.
-- SECURITY INVOKER on purpose: current_user must reflect the caller's role.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_doctor() then
    if tg_op = 'INSERT' then
      raise exception 'Not allowed to create profiles' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.created_by is distinct from old.created_by
       or new.id is distinct from old.id then
      raise exception 'Not allowed to change role or activation status' using errcode = '42501';
    end if;
  end if;

  -- The doctor may never be deactivated or demoted through the API.
  if tg_op = 'UPDATE' and old.role = 'doctor'
     and (new.role <> 'doctor' or not new.is_active)
     and current_user in ('authenticated', 'anon') then
    raise exception 'The doctor account cannot be demoted or deactivated' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- Patient self-service guard: patients may edit only name / email / DOB.
create or replace function public.patients_guard_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    if new.normalized_phone is distinct from old.normalized_phone
       or new.auth_user_id is distinct from old.auth_user_id
       or new.is_active is distinct from old.is_active
       or new.phone_verified_at is distinct from old.phone_verified_at
       or new.created_by is distinct from old.created_by then
      raise exception 'Patients may only update name, email and date of birth' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger patients_guard_self_update
  before update on public.patients
  for each row execute function public.patients_guard_self_update();

-- Auto-create a profile for every new auth user.
-- Role comes ONLY from raw_app_meta_data (writable solely by the service role),
-- never from raw_user_meta_data, so public sign-ups cannot self-escalate.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  v_role := case new.raw_app_meta_data ->> 'role'
              when 'doctor'    then 'doctor'::public.app_role
              when 'secretary' then 'secretary'::public.app_role
              else 'patient'::public.app_role
            end;

  insert into public.profiles (id, role, full_name, email, phone, is_active)
  values (
    new.id,
    v_role,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    nullif(lower(new.email), ''),
    public.normalize_phone(coalesce(new.raw_user_meta_data ->> 'phone', new.phone)),
    coalesce((new.raw_app_meta_data ->> 'is_active')::boolean, true)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Queue entry bookkeeping: version bump + updated_at.
create or replace function public.queue_entries_bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger queue_entries_bump_version
  before update on public.queue_entries
  for each row execute function public.queue_entries_bump_version();

-- Queue history: every insert and status change is recorded automatically.
-- Server code may set `select set_config('mosa3da.actor_id', '<uuid>', true)`
-- inside a transaction when acting through the service role.
create or replace function public.queue_entries_record_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(
    nullif(current_setting('mosa3da.actor_id', true), '')::uuid,
    auth.uid()
  );
  v_reason text := nullif(current_setting('mosa3da.reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.queue_status_history
      (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason, metadata)
    values
      (new.id, new.session_id, 'created', null, new.status, v_actor, v_reason,
       jsonb_build_object('queue_number', new.queue_number, 'position', new.position));
  elsif new.status is distinct from old.status then
    insert into public.queue_status_history
      (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason, metadata)
    values
      (new.id, new.session_id, 'status_changed', old.status, new.status, v_actor, v_reason,
       jsonb_build_object('position', new.position, 'version', new.version));
  elsif new.estimated_duration_minutes is distinct from old.estimated_duration_minutes then
    insert into public.queue_status_history
      (queue_entry_id, session_id, event_type, from_status, to_status, actor_id, reason, metadata)
    values
      (new.id, new.session_id, 'duration_changed', old.status, new.status, v_actor, v_reason,
       jsonb_build_object('from', old.estimated_duration_minutes, 'to', new.estimated_duration_minutes));
  end if;
  return new;
end;
$$;

create trigger queue_entries_record_history
  after insert or update on public.queue_entries
  for each row execute function public.queue_entries_record_history();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.patients             enable row level security;
alter table public.doctor_settings      enable row level security;
alter table public.clinic_working_days  enable row level security;
alter table public.clinic_sessions      enable row level security;
alter table public.appointments         enable row level security;
alter table public.queue_entries        enable row level security;
alter table public.queue_status_history enable row level security;
alter table public.otp_verifications    enable row level security;
alter table public.notification_logs    enable row level security;

-- Defense in depth: anon gets nothing on base tables. Public display data is
-- served only through an explicit SECURITY DEFINER function (migration 0002).
revoke all on all tables in schema public from anon;

-- profiles -------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_select_staff on public.profiles
  for select to authenticated using ((select public.is_staff()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_doctor on public.profiles
  for update to authenticated
  using ((select public.is_doctor()))
  with check ((select public.is_doctor()));

-- patients -------------------------------------------------------------------
create policy patients_select_own on public.patients
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy patients_select_staff on public.patients
  for select to authenticated using ((select public.is_staff()));

create policy patients_insert_staff on public.patients
  for insert to authenticated with check ((select public.is_staff()));

create policy patients_update_staff on public.patients
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy patients_update_own on public.patients
  for update to authenticated
  using (auth_user_id = (select auth.uid()) and is_active)
  with check (auth_user_id = (select auth.uid()));

-- doctor_settings --------------------------------------------------------------
create policy doctor_settings_select_authenticated on public.doctor_settings
  for select to authenticated using (true);

create policy doctor_settings_update_doctor on public.doctor_settings
  for update to authenticated
  using ((select public.is_doctor()))
  with check ((select public.is_doctor()));

-- clinic_working_days ----------------------------------------------------------
create policy clinic_working_days_select_authenticated on public.clinic_working_days
  for select to authenticated using (true);

create policy clinic_working_days_insert_doctor on public.clinic_working_days
  for insert to authenticated with check ((select public.is_doctor()));

create policy clinic_working_days_update_doctor on public.clinic_working_days
  for update to authenticated
  using ((select public.is_doctor()))
  with check ((select public.is_doctor()));

create policy clinic_working_days_delete_doctor on public.clinic_working_days
  for delete to authenticated using ((select public.is_doctor()));

-- clinic_sessions --------------------------------------------------------------
create policy clinic_sessions_select_staff on public.clinic_sessions
  for select to authenticated using ((select public.is_staff()));
-- Writes only through queue RPCs (SECURITY DEFINER).

-- appointments -----------------------------------------------------------------
create policy appointments_select_own on public.appointments
  for select to authenticated using (patient_id = (select public.current_patient_id()));

create policy appointments_select_staff on public.appointments
  for select to authenticated using ((select public.is_staff()));

create policy appointments_update_staff on public.appointments
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
-- Inserts (patient booking, staff booking, walk-in) and patient cancellations
-- go through validated RPCs so availability and conflict rules are enforced.

-- queue_entries ----------------------------------------------------------------
create policy queue_entries_select_own on public.queue_entries
  for select to authenticated using (patient_id = (select public.current_patient_id()));

create policy queue_entries_select_staff on public.queue_entries
  for select to authenticated using ((select public.is_staff()));
-- No direct INSERT/UPDATE/DELETE policies: all mutations go through queue RPCs.

-- queue_status_history ---------------------------------------------------------
create policy queue_status_history_select_staff on public.queue_status_history
  for select to authenticated using ((select public.is_staff()));

-- otp_verifications ------------------------------------------------------------
-- RLS enabled with no policies: accessible only via the service role.
revoke all on public.otp_verifications from authenticated;

-- notification_logs ------------------------------------------------------------
create policy notification_logs_select_staff on public.notification_logs
  for select to authenticated using ((select public.is_staff()));

create policy notification_logs_select_own on public.notification_logs
  for select to authenticated using (patient_id = (select public.current_patient_id()));

-- Audit table is append-only for everyone except the service role.
revoke insert, update, delete, truncate on public.queue_status_history from authenticated;
revoke insert, update, delete, truncate on public.queue_entries        from authenticated;
revoke insert, update, delete, truncate on public.clinic_sessions      from authenticated;
revoke insert, delete, truncate        on public.appointments          from authenticated;
revoke insert, update, delete, truncate on public.notification_logs    from authenticated;
revoke insert, delete, truncate        on public.doctor_settings       from authenticated;
revoke delete, truncate                on public.patients              from authenticated;
revoke insert, delete, truncate        on public.profiles              from authenticated;

-- Function execution grants
revoke execute on function public.handle_new_auth_user()                from public, anon, authenticated;
revoke execute on function public.profiles_guard_privileged_columns()   from public, anon, authenticated;
revoke execute on function public.patients_guard_self_update()          from public, anon, authenticated;
revoke execute on function public.queue_entries_record_history()        from public, anon, authenticated;
revoke execute on function public.current_patient_id()                  from public, anon;
revoke execute on function public.current_app_role()                    from public, anon;
revoke execute on function public.is_doctor()                           from public, anon;
revoke execute on function public.is_staff()                            from public, anon;
grant  execute on function public.current_patient_id()                  to authenticated;
grant  execute on function public.current_app_role()                    to authenticated;
grant  execute on function public.is_doctor()                           to authenticated;
grant  execute on function public.is_staff()                            to authenticated;

-- =============================================================================
-- REALTIME
-- postgres_changes honours RLS: staff receive all rows, patients only their own.
-- The public /display page uses polling or broadcast, never base-table access.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.queue_entries,
      public.clinic_sessions,
      public.appointments,
      public.notification_logs;
  end if;
end;
$$;

alter table public.queue_entries   replica identity full;
alter table public.clinic_sessions replica identity full;

-- =============================================================================
-- REQUIRED CONFIGURATION ROWS
-- =============================================================================
insert into public.doctor_settings (id) values (1) on conflict (id) do nothing;

commit;
