-- =============================================================================
-- Migration 0007: Queue entry version bumps only on meaningful changes
--
-- The version is the optimistic-lock token staff screens send back with every
-- queue action (MQ412 "updated by someone else"). It was bumped on EVERY
-- update, including _recalculate_queue rewriting expected_start_at. Because the
-- projection is anchored at now(), every queue action, check-in or walk-in
-- moved the expected time of every waiting entry and silently invalidated the
-- version held by every open screen, so "Start consultation" failed even when
-- nobody had touched that patient.
--
-- Now the version changes only when a column that a person acts on changes.
-- Derived fields (expected_start_at) and bookkeeping (updated_at) do not.
-- =============================================================================

begin;

create or replace function public.queue_entries_bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.status                     is distinct from old.status
     or new.position                   is distinct from old.position
     or new.queue_number               is distinct from old.queue_number
     or new.estimated_duration_minutes is distinct from old.estimated_duration_minutes
     or new.visit_reason               is distinct from old.visit_reason
     or new.missed_turn_at             is distinct from old.missed_turn_at
     or new.missed_turn_baseline       is distinct from old.missed_turn_baseline
     or new.staff_notes                is distinct from old.staff_notes
     or new.patient_id                 is distinct from old.patient_id
     or new.appointment_id             is distinct from old.appointment_id
     or new.session_id                 is distinct from old.session_id
  then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

commit;
