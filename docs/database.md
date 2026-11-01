# Dr. Rodaina Medhat Clinic — Database

Source of truth: `supabase/migrations/*.sql`. `prisma/schema.prisma` is a typed mirror for introspection and client typing only; never run `prisma migrate` or `prisma db push`.

## Apply

```bash
npx supabase link --project-ref <ref>
npx supabase db push              # applies supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

Or paste the migration, then `seed.sql`, into the Supabase SQL editor.

## Tables

| Table | Purpose |
|---|---|
| profiles | 1:1 with auth.users. Authoritative role (doctor / secretary / patient) and is_active. |
| patients | Clinical identity, unique E.164 phone. auth_user_id is null for walk-ins without an account. |
| doctor_settings | Singleton (id = 1): timezone, default duration, WhatsApp threshold, late policy count, booking horizon, cancellation cutoff, slot interval. |
| clinic_working_days | Weekly working periods, several per weekday allowed, overlaps rejected by an exclusion constraint. |
| clinic_sessions | One queue per clinic date. Holds next_queue_number and finished_consultations_count. |
| appointments | Bookings. Overlapping active slots rejected by an exclusion constraint. One active appointment per patient per day. |
| queue_entries | A patient's participation in a session. Scheduled entries hold no number or position. |
| queue_status_history | Append-only log, written by trigger on every insert / status / duration change. |
| otp_verifications | HMAC-SHA256 hashed codes with expiry and attempt cap. Service role only. |
| notification_logs | Simulated WhatsApp messages. Unique idempotency_key prevents duplicates. |

## Invariants enforced in the database

- At most one `current` and one `ready` entry per session (partial unique indexes).
- A patient is active at most once per session.
- Queue numbers and positions are unique per session (position is deferrable for reordering).
- Status and timestamp consistency (current needs started_at, finished needs finished_at, cancelled needs cancelled_at, etc.).
- Phone numbers are normalized by trigger (`01001234567` → `+201001234567`) before the unique check.

## Late policy fields

When staff mark the Ready patient absent, the RPC sets `missed_turn_at` and `missed_turn_baseline = clinic_sessions.finished_consultations_count`. The consultation that caused the miss has already been counted, so it is excluded. Each finish increments the counter; once `count >= baseline + late_policy_consultations` (default 2) and the patient is still absent, they become `late` and move to the end of the eligible queue. Arriving earlier clears both fields and logs `late_policy_cancelled`.

## Security boundary

- RLS on every table. `anon` has no table privileges; `/display` will read through a SECURITY DEFINER function that returns masked names and queue numbers only.
- Staff = active doctor or secretary (`is_staff()`). An inactive secretary passes no policy.
- Patients see only their own patient row, appointments, queue entries and notifications.
- Roles come only from `raw_app_meta_data` (service role writable) when a profile is auto-created. Triggers block role or activation changes by anyone other than the doctor.
- `queue_entries`, `clinic_sessions`, `appointments` inserts and `notification_logs` writes are revoked from `authenticated`. They go through RPCs (migration 0002, Thread 2) or the service role, which must perform its own authorization checks.
- Service-role code can set `set_config('mosa3da.actor_id', <uuid>, true)` so history rows record the acting staff member.

## Verified locally

The migration and seed were run on PostgreSQL 16 with Supabase auth stubs. Checked: profile auto-creation and role escalation blocked via user metadata, second Current rejected, overlapping working periods and slots rejected, duplicate phone in a different format rejected, patient isolation, inactive secretary sees nothing, direct queue writes denied, anon denied.
