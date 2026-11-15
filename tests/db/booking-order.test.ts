/**
 * Checked-in booked visitors keep booking order until the next one is called in
 * (migration 20261115002100). Against real PostgreSQL; run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000f3";

describe.skipIf(!enabled)("booking order until called (PostgreSQL)", () => {
  let pool: pg.Pool;

  async function as<T = any>(who: string | "service", sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      if (who === "service") await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      else {
        await c.query("set local role authenticated");
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: "authenticated" })]);
      }
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows as T[];
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  const rpc = async (fn: string, args: unknown[]) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    return (await as<{ r: any }>(SECRETARY, `select public.${fn}(${ph}) as r`, args))[0]!.r;
  };
  const act = (id: string, action: string) => rpc("queue_transition", [id, action, null, null]);
  const entryOf = async (apptId: string) =>
    (await as<{ id: string }>("service", "select id from public.queue_entries where appointment_id = $1", [apptId]))[0]!.id;
  /** Present patients in order: current, ready, then waiting by position. */
  const line = async () =>
    (
      await as<{ id: string; status: string }>("service", `
        select q.id, q.status from public.queue_entries q
        where q.clinic_date = public.clinic_today() and q.status in ('current', 'ready', 'arrived', 'late')
        order by case q.status when 'current' then 0 when 'ready' then 1 else 2 end, q.position`)
    ).map((r) => r.id);

  async function bookToday(phone: string, name: string, offsetMinutes: number): Promise<string> {
    const [row] = await as<{ id: string }>("service", `
      with p as (insert into public.patients (full_name, normalized_phone) values ($1, $2) returning id)
      insert into public.appointments (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason, status, source)
      select p.id, public.clinic_today(),
             date_trunc('minute', now()) + make_interval(mins => $3::int),
             date_trunc('minute', now()) + make_interval(mins => $3::int + 20), 20, 'ultrasound', 'scheduled', 'staff'
      from p returning id`, [name, phone, offsetMinutes]);
    await rpc("open_clinic_session", [null]);
    return row!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await as("service", `
      truncate public.notification_logs, public.queue_status_history, public.queue_entries,
               public.clinic_sessions, public.appointments cascade;
      delete from public.patients where normalized_phone like '+2010666%';
      delete from auth.users where id in ('${SECRETARY}');
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}') on conflict (id) do nothing;
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${SECRETARY}', 'sec-order@test.local', '{"role":"secretary"}', '{"full_name":"Sec Order"}');
      update public.visit_reason_settings set default_duration_minutes = 20, is_active = true where reason = 'ultrasound';
      insert into public.clinic_sessions (clinic_date, opens_at, closes_at, status)
      values (public.clinic_today(), now() - interval '1 hour', now() + interval '6 hours', 'open');
    `);
  });

  afterAll(async () => {
    if (!pool) return;
    await as("service", `
      truncate public.queue_status_history, public.queue_entries, public.clinic_sessions, public.appointments cascade;
      delete from public.patients where normalized_phone like '+2010666%'`);
    await pool.end();
  });

  it("an earlier booking that checks in before Next Up is called in takes her place", async () => {
    const b1 = await bookToday("01066600001", "Booking One", 5);
    const b2 = await bookToday("01066600002", "Booking Two", 30);
    const b3 = await bookToday("01066600003", "Booking Three", 80);
    const walk = (await rpc("register_walk_in", ["Walk In", "01066600009", "ultrasound", null, 20, null, null])).queue_entry_id as string;
    await act(walk, "start_consultation");

    await act(await entryOf(b2), "mark_arrived");
    expect(await line()).toEqual([walk, await entryOf(b2)]);

    await act(await entryOf(b1), "mark_arrived");
    expect(await line()).toEqual([walk, await entryOf(b1), await entryOf(b2)]);

    await act(await entryOf(b3), "mark_arrived");
    expect(await line()).toEqual([walk, await entryOf(b1), await entryOf(b2), await entryOf(b3)]);

    await act(walk, "finish_consultation");
    await act(await entryOf(b1), "start_consultation");
    expect(await line()).toEqual([await entryOf(b1), await entryOf(b2), await entryOf(b3)]);
  });

  it("a Next Up chosen by staff is kept", async () => {
    const [b3] = (await as<{ id: string }>("service", "select a.id from public.appointments a join public.patients p on p.id = a.patient_id where p.full_name = 'Booking Three'")).map((r) => r.id);
    await act(await entryOf(b3!), "mark_ready");
    const b0 = await bookToday("01066600000", "Booking Zero", 55);
    await act(await entryOf(b0), "mark_arrived");
    expect((await line())[1]).toBe(await entryOf(b3!));
  });
});
