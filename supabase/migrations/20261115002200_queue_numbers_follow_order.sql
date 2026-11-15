-- =============================================================================
-- Migration 0023: waiting patients' numbers follow the queue order (2026-11-15)
--
-- A queue number was handed out at check-in, so when the queue is put in
-- booking order (0020 / 0022) the numbers looked shuffled: #7, #8, #9, #6.
-- Now, after every queue change, the patients still waiting (Ready, Arrived,
-- Late) share the numbers they already hold, reassigned in queue order: the
-- Ready patient gets the lowest, then by position. Patients inside, finished,
-- absent or cancelled keep their numbers; no new numbers are issued.
-- =============================================================================

begin;

create or replace function public._renumber_waiting(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids  uuid[];
  v_nums integer[];
  v_off  integer;
begin
  select array_agg(q.id order by case when q.status = 'ready' then 0 else 1 end, q.position, q.created_at, q.id),
         array_agg(q.queue_number order by q.queue_number)
  into v_ids, v_nums
  from public.queue_entries q
  where q.session_id = p_session_id
    and q.status in ('ready', 'arrived', 'late')
    and q.missed_turn_at is null
    and q.queue_number is not null;

  if coalesce(array_length(v_ids, 1), 0) < 2 then
    return;
  end if;

  -- Already in order: nothing to do.
  if not exists (
    select 1
    from unnest(v_ids) with ordinality as o(id, ord)
    join public.queue_entries q on q.id = o.id
    where q.queue_number <> v_nums[o.ord]
  ) then
    return;
  end if;

  -- (session_id, queue_number) is unique and not deferrable: move the numbers
  -- out of the way first, then into place.
  select coalesce(max(q.queue_number), 0) + 100000 into v_off
  from public.queue_entries q where q.session_id = p_session_id;

  update public.queue_entries q
  set queue_number = q.queue_number + v_off
  where q.id = any (v_ids);

  update public.queue_entries q
  set queue_number = v_nums[o.ord]
  from unnest(v_ids) with ordinality as o(id, ord)
  where q.id = o.id;
end;
$$;

revoke execute on function public._renumber_waiting(uuid) from public, anon, authenticated;

create or replace function public._finalize(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._maintain_ready(p_session_id);
  perform public._renumber_waiting(p_session_id);
  perform public._recalculate_queue(p_session_id);
end;
$$;

-- Today's open session(s): put the numbers in order now.
do $$
declare r record;
begin
  for r in select id from public.clinic_sessions where clinic_date = public.clinic_today() loop
    perform public._renumber_waiting(r.id);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
