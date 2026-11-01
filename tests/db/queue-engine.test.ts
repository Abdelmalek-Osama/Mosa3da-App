/**
 * End-to-end queue engine tests against a real PostgreSQL database.
 * Run: tests/db/setup-local.sh && npm run test:db
 * Skipped when TEST_DATABASE_URL is not set. Refuses Supabase hosts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { projectQueue } from "@/server/domain/queue/projection";
import type { QueueEntryState } from "@/server/domain/queue/types";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000e0";
const INACTIVE = "00000000-0000-0000-0000-0000000000e1";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000a0";

type Who = { sub: string } | "anon" | "service";

describe.skipIf(!enabled)("queue engine (PostgreSQL)", () => {
  let pool: pg.Pool;

  /** Runs SQL in its own transaction as the given Supabase identity. */
  async function as<T = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (who === "anon") {
        await client.query("set local role anon");
        await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      } else if (who === "service") {
        await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      } else {
        await client.query("set local role authenticated");
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: who.sub, role: "authenticated" }),
        ]);
      }
      const res = await client.query(sql, params);
      await client.query("commit");
      return res.rows as T[];
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const sec = { sub: SECRETARY };
  const rpc = async (who: Who, fn: string, args: unknown[]) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const [row] = await as<{ r: any }>(who, `select public.${fn}(${placeholders}) as r`, args);
    return row!.r;
  };
  const walkIn = (phone: string, name: string, minutes: number) =>
    rpc(sec, "register_walk_in", [name, phone, "ultrasound", null, minutes, null, null]);
  const act = (id: string, action: string, version: number | null = null) =>
    rpc(sec, "queue_transition", [id, action, version, null]);
  const entry = async (id: string) =>
    (await as<any>("service", "select * from public.queue_entries where id = $1", [id]))[0];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 6 });
    await as("service", `
      truncate public.notification_logs, public.queue_status_history, public.queue_entries,
               public.clinic_sessions, public.otp_verifications, public.appointments cascade;
      delete from public.patients where normalized_phone like '+2010999%';
      delete from auth.users where id in ('${DOCTOR}', '${SECRETARY}', '${INACTIVE}', '${PATIENT_USER}');
    `);
    await as("service", `
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}'),
        ('${SECRETARY}', 'sec@test.local', '{"role":"secretary"}', '{"full_name":"Sec Test"}'),
        ('${INACTIVE}', 'old@test.local', '{"role":"secretary","is_active":false}', '{"full_name":"Old Sec"}'),
        ('${PATIENT_USER}', 'p@test.local', '{}', '{"full_name":"Sneaky Patient","role":"doctor"}');
    `);
    // Deterministic projection: today's session opens 2 hours from now.
    await as("service", `
      insert into public.clinic_sessions (clinic_date, opens_at, closes_at, status)
      values (public.clinic_today(), date_trunc('minute', now()) + interval '2 hours',
              date_trunc('minute', now()) + interval '6 hours', 'open')
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("never lets public sign-ups choose a privileged role", async () => {
    const [p] = await as<{ role: string }>("service", "select role from public.profiles where id = $1", [PATIENT_USER]);
    expect(p!.role).toBe("patient"); // user_metadata.role is ignored
    const [q] = await as<{ role: string }>("service", "select role from public.profiles where id = $1", [SECRETARY]);
    expect(q!.role).toBe("secretary");
  });

  let A: string, B: string, C: string, D: string, E: string;

  it("walk-in registration assigns numbers and projects 0 / +15 / +35 minutes", async () => {
    A = (await walkIn("01099900001", "Patient Alpha", 15)).queue_entry_id;
    B = (await walkIn("01099900002", "Patient Bravo", 20)).queue_entry_id;
    C = (await walkIn("01099900003", "Patient Charlie", 20)).queue_entry_id;
    D = (await walkIn("01099900004", "Patient Delta", 20)).queue_entry_id;
    E = (await walkIn("01099900005", "Patient Echo", 20)).queue_entry_id;

    const [s] = await as<{ opens_at: Date }>("service", "select opens_at from public.clinic_sessions where clinic_date = public.clinic_today()");
    const rows = await Promise.all([A, B, C].map(entry));
    const offsets = rows.map((r) => (new Date(r.expected_start_at).getTime() - s!.opens_at.getTime()) / 60000);
    expect(offsets).toEqual([0, 15, 35]);
    expect(rows.map((r) => r.queue_number)).toEqual([1, 2, 3]);
    expect(rows[0].status).toBe("ready");
    expect(rows[1].status).toBe("arrived");
  });

  it("SQL projection matches the TypeScript formula", async () => {
    const rows = await as<any>("service", `
      select q.*, s.opens_at, now() as db_now from public.queue_entries q
      join public.clinic_sessions s on s.id = q.session_id where s.clinic_date = public.clinic_today()`);
    const states: QueueEntryState[] = rows.map((r) => ({
      id: r.id, status: r.status, position: r.position, createdAt: r.created_at,
      estimatedDurationMinutes: r.estimated_duration_minutes, startedAt: r.started_at,
      missedTurnAt: r.missed_turn_at, missedTurnBaseline: r.missed_turn_baseline,
    }));
    const { expectedStart } = projectQueue({ entries: states, opensAt: rows[0].opens_at, now: rows[0].db_now });
    for (const r of rows) expect(expectedStart.get(r.id)?.getTime() ?? null).toBe(r.expected_start_at?.getTime() ?? null);
  });

  it("rejects duplicate walk-ins for the same patient", async () => {
    await expect(walkIn("+20 109 990 0001", "Patient Alpha", 15)).rejects.toMatchObject({ code: "MQ409" });
  });

  it("starts a consultation only on explicit staff action", async () => {
    await act(A, "start_consultation");
    expect((await entry(A)).status).toBe("current");
    await expect(act(B, "start_consultation")).rejects.toMatchObject({ code: "MQ409" });
  });

  it("rejects stale versions", async () => {
    const e = await entry(C);
    await expect(act(C, "mark_late", e.version - 1)).rejects.toMatchObject({ code: "MQ412" });
  });

  it("late policy: absent Ready patient becomes Late after TWO subsequent consultations", async () => {
    // A = Current. Make B the Ready patient.
    if ((await entry(B)).status !== "ready") await act(B, "mark_ready");
    await act(A, "finish_consultation"); // A finishes — B stays Ready, no auto start
    expect((await entry(B)).status).toBe("ready");

    await act(B, "mark_absent"); // B misses the turn (A is NOT counted)
    const b1 = await entry(B);
    expect(b1.missed_turn_at).not.toBeNull();
    expect(b1.expected_start_at).toBeNull();
    expect((await entry(C)).status).toBe("ready");

    await act(C, "start_consultation");
    await act(C, "finish_consultation"); // 1st subsequent
    expect((await entry(B)).status).toBe("arrived");

    await act(D, "start_consultation");
    const res = await act(D, "finish_consultation"); // 2nd subsequent
    expect(res.late_transitions).toBe(1);

    const b2 = await entry(B);
    expect(b2.status).toBe("late");
    expect(b2.missed_turn_at).toBeNull();
    const [{ max }] = (await as<{ max: number }>("service", "select max(position) as max from public.queue_entries where session_id = $1", [b2.session_id])) as [{ max: number }];
    expect(b2.position).toBe(max);

    const history = await as<{ event_type: string }>("service", "select event_type from public.queue_status_history where queue_entry_id = $1 order by id", [B]);
    expect(history.map((h) => h.event_type)).toEqual(
      expect.arrayContaining(["created", "missed_turn", "late_policy_applied"]),
    );
  });

  it("cancels the late policy when the patient returns in time", async () => {
    expect((await entry(E)).status).toBe("ready");
    await act(E, "mark_absent");
    await act(E, "mark_arrived");
    const e = await entry(E);
    expect(e.missed_turn_at).toBeNull();
    expect(e.expected_start_at).not.toBeNull();
    const history = await as<{ event_type: string }>("service", "select event_type from public.queue_status_history where queue_entry_id = $1", [E]);
    expect(history.map((h) => h.event_type)).toContain("late_policy_cancelled");
  });

  it("denies inactive secretaries and patients", async () => {
    await expect(rpc({ sub: INACTIVE }, "queue_transition", [E, "cancel", null, null])).rejects.toMatchObject({ code: "MQ403" });
    await expect(rpc({ sub: PATIENT_USER }, "queue_transition", [E, "cancel", null, null])).rejects.toMatchObject({ code: "MQ403" });
    await expect(as({ sub: SECRETARY }, "update public.queue_entries set status = 'finished'")).rejects.toMatchObject({ code: "42501" });
  });

  it("public display board exposes no phone numbers or full names", async () => {
    const board = await rpc("anon", "get_display_board", []);
    const text = JSON.stringify(board);
    expect(text).not.toMatch(/\+20/);
    expect(text).not.toContain("Patient Bravo");
    expect(text).toContain("Patient B.");
    await expect(as("anon", "select * from public.patients")).rejects.toMatchObject({ code: "42501" });
  });

  it("patients see only their own queue status", async () => {
    await as("service", "update public.patients set auth_user_id = $1 where normalized_phone = '+201099900005'", [PATIENT_USER]);
    const status = await rpc({ sub: PATIENT_USER }, "get_my_queue_status", []);
    expect(status.in_queue).toBe(true);
    expect(status.queue_number).toBe(5);
    const visible = await as({ sub: PATIENT_USER }, "select id from public.queue_entries");
    expect(visible).toHaveLength(1);
  });

  it("notifications are idempotent", async () => {
    await as("service", "update public.doctor_settings set whatsapp_threshold_minutes = 240 where id = 1");
    const first = await as("service", "select * from public.enqueue_due_notifications()");
    const second = await as("service", "select * from public.enqueue_due_notifications()");
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(0);
    // Default language is Arabic; template_params feed the Meta template.
    expect((first[0] as any).locale).toBe("ar");
    expect((first[0] as any).message_body).toMatch(/^مرحبًا .+، اقترب موعد دخولكِ/);
    expect((first[0] as any).channel).toBe("whatsapp_link");
    expect((first[0] as any).template_params).toHaveLength(2);
  });

  it("allows exactly one Current patient under concurrent requests", async () => {
    const [cur] = await as<{ id: string }>("service", "select id from public.queue_entries where status = 'current'");
    if (cur) await act(cur.id, "finish_consultation");
    const waiting = await as<{ id: string }>("service", `
      select id from public.queue_entries
      where status in ('ready','arrived','late') and missed_turn_at is null order by position limit 2`);
    expect(waiting).toHaveLength(2);
    const results = await Promise.allSettled(waiting.map((w) => act(w.id, "start_consultation")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "MQ409" });
  });
});
