-- =============================================================================
-- Migration 0022: checked-in booked visitors keep booking order until called
-- (2026-11-15)
--
-- Problem: while a patient is inside, Booking #2 checks in and the system makes
-- her Ready ("Next Up"). When Booking #1 checks in before #2 is called in, #1
-- stayed behind #2, because a booked Ready patient was never replaced.
--
-- Now a Ready patient the system picked is replaced by a present booked visitor
-- with an earlier booked time, as long as the Ready patient has not entered the
-- room (Start Consultation). The replaced visitor goes back into the booked
-- order, right behind. A Ready patient chosen by staff (mark_ready) is still
-- never replaced. Walk-in rules from 0020 are unchanged.
-- =============================================================================

begin;

-- Same as 0020, except the Ready rule:
--   * staff-picked Ready: kept;
--   * system-picked booked Ready: replaced by an earlier-booked present visitor;
--   * system-picked walk-in Ready: replaced when a present booked visitor would
--     otherwise start after her booked time (unchanged).
create or replace function public._sequence_waiting(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t         timestamptz := public._queue_anchor(p_session_id);
  v_ready     record;
  v_demote    uuid;
  v_demote_booked boolean := false;
  v_w         uuid[];
  v_wdur      integer[];
  v_b         uuid[];
  v_bat       timestamptz[];
  v_bdur      integer[];
  v_order     uuid[] := '{}';
  v_positions integer[];
  v_nw        integer;
  v_nb        integer;
  i           integer := 1;
  j           integer := 1;
begin
  select q.id, q.ready_pinned, q.estimated_duration_minutes as dur,
         (a.scheduled_start is not null and a.delayed_at is null) as booked,
         case when a.delayed_at is null then a.scheduled_start end as booked_at
  into v_ready
  from public.queue_entries q
  left join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id and q.status = 'ready'
  limit 1;

  select array_agg(a.scheduled_start order by a.scheduled_start, q.position, q.id),
         array_agg(q.id order by a.scheduled_start, q.position, q.id),
         array_agg(q.estimated_duration_minutes order by a.scheduled_start, q.position, q.id)
  into v_bat, v_b, v_bdur
  from public.queue_entries q
  join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id
    and q.status = 'arrived'
    and q.missed_turn_at is null
    and a.scheduled_start is not null
    and a.delayed_at is null;

  v_nb := coalesce(array_length(v_b, 1), 0);

  if v_ready.id is not null then
    if v_ready.ready_pinned then
      v_t := v_t + make_interval(mins => v_ready.dur);
    elsif v_ready.booked then
      -- Booking order holds until she is called in: an earlier booking that
      -- has checked in takes her place.
      if v_nb > 0 and v_bat[1] < v_ready.booked_at then
        v_demote := v_ready.id;
        v_demote_booked := true;
      else
        v_t := v_t + make_interval(mins => v_ready.dur);
      end if;
    elsif v_nb = 0 or v_bat[1] >= v_t + make_interval(mins => v_ready.dur) then
      v_t := v_t + make_interval(mins => v_ready.dur);
    else
      v_demote := v_ready.id;
    end if;
  end if;

  -- A replaced booked visitor rejoins the booked order (by booked time).
  if v_demote_booked then
    select array_agg(a.scheduled_start order by a.scheduled_start, q.position, q.id),
           array_agg(q.id order by a.scheduled_start, q.position, q.id),
           array_agg(q.estimated_duration_minutes order by a.scheduled_start, q.position, q.id)
    into v_bat, v_b, v_bdur
    from public.queue_entries q
    join public.appointments a on a.id = q.appointment_id
    where q.session_id = p_session_id
      and (q.status = 'arrived' or q.id = v_demote)
      and q.missed_turn_at is null
      and a.scheduled_start is not null
      and a.delayed_at is null;
    v_nb := coalesce(array_length(v_b, 1), 0);
  end if;

  select array_agg(q.id order by q.position, q.created_at, q.id),
         array_agg(q.estimated_duration_minutes order by q.position, q.created_at, q.id)
  into v_w, v_wdur
  from public.queue_entries q
  left join public.appointments a on a.id = q.appointment_id
  where q.session_id = p_session_id
    and q.missed_turn_at is null
    and (q.status = 'late'
         or (q.status = 'arrived' and (a.scheduled_start is null or a.delayed_at is not null))
         or (q.id = v_demote and not v_demote_booked));

  v_nw := coalesce(array_length(v_w, 1), 0);
  if v_nw + v_nb < 2 and v_demote is null then
    return null;
  end if;

  while i <= v_nw or j <= v_nb loop
    if j <= v_nb and (i > v_nw or v_bat[j] < v_t + make_interval(mins => v_wdur[i])) then
      v_order := v_order || v_b[j];
      v_t := v_t + make_interval(mins => v_bdur[j]);
      j := j + 1;
    else
      v_order := v_order || v_w[i];
      v_t := v_t + make_interval(mins => v_wdur[i]);
      i := i + 1;
    end if;
  end loop;

  select array_agg(q.position order by q.position)
  into v_positions
  from public.queue_entries q
  where q.id = any (v_order);

  update public.queue_entries q
  set position = v_positions[o.ord]
  from unnest(v_order) with ordinality as o(id, ord)
  where q.id = o.id and q.position is distinct from v_positions[o.ord];

  return v_demote;
end;
$$;

revoke execute on function public._sequence_waiting(uuid) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
