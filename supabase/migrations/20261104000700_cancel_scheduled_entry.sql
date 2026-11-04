-- =============================================================================
-- Migration 0008: Cancelling a booking that has not checked in (P0-02)
--
-- Today's bookings have a 'scheduled' placeholder in the queue with no number
-- and no position. staff_cancel_appointment, cancel_my_appointment and the
-- queue's 'cancel' action set that placeholder to 'cancelled', which violated
-- queue_entries_position_required (only 'scheduled' could lack a number), so
-- cancelling any not-yet-arrived booking for today failed.
--
-- A cancelled entry may now also have no number/position: a booking that was
-- cancelled before check-in never received one. The appointment still goes
-- scheduled -> cancelled directly, and its slot is free again immediately
-- (availability only counts scheduled / checked_in appointments).
-- =============================================================================

begin;

alter table public.queue_entries drop constraint queue_entries_position_required;
alter table public.queue_entries add constraint queue_entries_position_required check (
  status in ('scheduled', 'cancelled') or (queue_number is not null and position is not null)
);

commit;
