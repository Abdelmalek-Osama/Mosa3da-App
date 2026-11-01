# Mosa3da — Queue Engine (Thread 2)

## Layers

| Layer | File |
|---|---|
| Atomic mutations (authoritative) | `supabase/migrations/20261031000100_queue_engine.sql` |
| Pure rules (projection, late policy, allowed actions) | `src/server/domain/queue/*` |
| Application service (RPC calls, DTO parsing) | `src/server/application/queue/queue-service.ts` |
| Server Actions (auth + Zod + revalidate) | `src/features/queue/actions.ts` |
| Notifications | `src/server/application/notifications/process-notifications.ts`, `src/server/integrations/whatsapp/*` |
| Route Handlers | `/api/display` (public), `/api/cron/notifications` (Bearer CRON_SECRET), `/api/health` |

## Expected time

```
anchor = Current ? max(current.started_at + current.duration, now) : max(opens_at, now)
ExpectedStart(1) = anchor
ExpectedStart(N) = ExpectedStart(N-1) + Duration(N-1)
```

Eligible patients are Ready, Arrived and Late who are present, ordered Ready first, then position, created_at, id. Finished, Cancelled, Scheduled and absent patients are excluded. A running consultation pushes the queue back by its remaining time; an overrunning one anchors the queue at "now". The SQL function `_recalculate_queue` is authoritative; `projectQueue` in TypeScript is a mirror and a DB test checks they match.

## Server Actions

All return `ActionResult<T>` (`{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`).

| Action | Who | Effect |
|---|---|---|
| `getQueueBoardAction()` | staff | Opens/syncs today's session, returns current / ready / waiting / scheduled / absent / done + stats |
| `registerWalkInAction(input)` | staff | Find-or-create patient → appointment (walk_in, checked_in) → queue entry (Arrived). Checks in an existing booking for today instead of duplicating |
| `transitionQueueEntryAction({ entryId, action, expectedVersion?, reason? })` | staff | `mark_arrived`, `mark_ready`, `mark_absent`, `start_consultation`, `finish_consultation`, `mark_late`, `cancel` |
| `reorderQueueEntryAction({ entryId, newIndex })` | staff | Moves a waiting patient; positions reassigned atomically |
| `updateQueueDurationAction({ entryId, durationMinutes })` | staff | Changes duration, recalculates |
| `searchPatientsAction(query)` | staff | Name / phone search for walk-in "existing patient" |
| `getMyQueueStatusAction()` | patient | Own number, status, patients ahead, wait minutes |
| `runNotificationSimulationAction()` | staff | Runs the WhatsApp simulation now |

Pass `expectedVersion` (the row's `version`) from the UI; a stale click returns code `STALE` instead of overwriting newer state.

## Transitions

- Adding a patient: number + end position, first present patient auto-promoted to Ready if none, times recalculated.
- Finishing: Current → Finished, finish counter +1, late policy evaluated, next present patient promoted to Ready. The Ready patient is **not** started automatically; staff confirm with `start_consultation`.
- Only one Current and one Ready per day, enforced by unique indexes and a session row lock (tested with concurrent requests).

## Late policy

1. Staff `mark_absent` on the Ready patient → `missed_turn_at`, `missed_turn_baseline = finished count`. The consultation that caused the miss is already counted, so it is excluded.
2. After 2 more finished consultations (`doctor_settings.late_policy_consultations`) and still absent → Late, moved to the end, history row `late_policy_applied`.
3. If they come back first, `mark_arrived` clears the fields and logs `late_policy_cancelled`.

## Notifications

`enqueue_due_notifications()` inserts one pending row per entry within the threshold, keyed `consultation_approaching:<entry id>`, so reruns never duplicate. The processor claims each row with a conditional update before calling the provider. The provider is a simulator; messages are visible in `notification_logs` and are never claimed to be real WhatsApp sends. The processor also runs after every queue mutation, because the Vercel Hobby plan only allows a daily cron.

## Patient sign-in identity

Patients log in with phone + password. To avoid needing an SMS provider, each patient's Supabase Auth user uses an internal email derived from the phone (`src/lib/auth/patient-identity.ts`). It is never shown or emailed.

## Demo seed

```bash
npm run seed:demo          # accounts, future appointments, today's queue
npm run seed:demo:reset    # rebuild today's demo queue
```

Creates doctor, active + inactive secretary, one patient login (+201001234561), and today's queue with Finished, Current, Ready, Late, Arrived and Scheduled patients plus notifications.

## Tests

```bash
npm test                                                   # unit
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/mosa3da_test tests/db/setup-local.sh
TEST_DATABASE_URL=... npm run test:db                      # real PostgreSQL scenario
```
