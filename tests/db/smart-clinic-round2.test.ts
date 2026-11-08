/**
 * Round 2: booked-visitor priority with grace shifts, staff day-only booking,
 * visit feedback. Against real PostgreSQL; run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000f1";
const VISITOR = "00000000-0000-0000-0000-0000000000f2";

describe.skipIf(!enabled)("smart clinic round 2 (PostgreSQL)", () => {
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
  const rpc = async (who: string, fn: string, args: unknown[]) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    return (await as<{ r: any }>(who, `select public.${fn}(${ph}) as r`, args))[0]!.r;
  };
  const walkIn = async (n: number) =>
    (await rpc(SECRETARY, "register_walk_in", [`Walk In ${n}`, `0107770000${n}`, "ultrasound", null, 20, null, null])).queue_entry_id as string;
  const act = (id: string, action: string) => rpc(SECRETARY, "queue_transition", [id, action, null, null]);
  const status = async (id: string) =>
    (await as<{ status: string; position: number | null }>("service", "select status, position from public.queue_entries where id = $1", [id]))[0]!;
  const ready = async () =>
    (await as<{ id: string }>("service", "select id from public.queue_entries where clinic_date = public.clinic_today() and status = 'ready'"))[0]?.id;
  const appt = async (id: string) =>
    (await as<{ grace_shifts: number; delayed_at: Date | null }>("service", "select grace_shifts, delayed_at from public.appointments where id = $1", [id]))[0]!;
  const entryOf = async (apptId: string) =>
    (await as<{ id: string }>("service", "select id from public.queue_entries where appointment_id = $1", [apptId]))[0]!.id;

  /** A booking for today at now() + offset minutes, with its Scheduled queue placeholder. */
  async function bookToday(phone: string, name: string, offsetMinutes: number): Promise<string> {
    const [row] = await as<{ id: string }>("service", `
      with p as (
        insert into public.patients (full_name, normalized_phone) values ($1, $2) returning id
      )
      insert into public.appointments (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason, status, source)
      select p.id, public.clinic_today(),
             date_trunc('minute', now()) + make_interval(mins => $3::int),
             date_trunc('minute', now()) + make_interval(mins => $3::int + 20), 20, 'ultrasound', 'scheduled', 'staff'
      from p returning id`, [name, phone, offsetMinutes]);
    await rpc(SECRETARY, "open_clinic_session", [null]);
    return row!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await as("service", `
      truncate public.notification_logs, public.queue_status_history, public.queue_entries,
               public.clinic_sessions, public.appointments cascade;
      delete from public.patients where normalized_phone like '+2010777%' or normalized_phone like '+2010888%';
      delete from auth.users where id in ('${DOCTOR}', '${SECRETARY}', '${VISITOR}');
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}'),
        ('${SECRETARY}', 'sec-r2@test.local', '{"role":"secretary"}', '{"full_name":"Sec R2"}'),
        ('${VISITOR}', 'visitor-r2@test.local', '{}', '{"full_name":"Visitor R2"}');
      insert into public.patients (full_name, normalized_phone, auth_user_id, phone_verified_at)
      values ('Visitor R2', '01088800001', '${VISITOR}', now());
      update public.visit_reason_settings set default_duration_minutes = 20, is_active = true where reason in ('ultrasound', 'pregnancy_follow_up');
      -- Today's session opened an hour ago, so booked times can already be due.
      insert into public.clinic_sessions (clinic_date, opens_at, closes_at, status)
      values (public.clinic_today(), now() - interval '1 hour', now() + interval '6 hours', 'open');
    `);
  });

  afterAll(async () => {
    if (!pool) return;
    await as("service", `
      truncate public.queue_status_history, public.queue_entries, public.clinic_sessions, public.appointments cascade;
      delete from public.patients where normalized_phone like '+2010777%' or normalized_phone like '+2010888%'`);
    await pool.end();
  });

  let W1: string, W2: string, B1: string;

  it("a booked visitor who is not here yet is shifted when the next patient is called", async () => {
    W1 = await walkIn(1);
    W2 = await walkIn(2);
    expect(await ready()).toBe(W1);
    B1 = await bookToday("01077700091", "Booked One", -5); // her time has come
    await act(W1, "start_consultation"); // calls the next patient: W2
    expect(await ready()).toBe(W2);
    expect((await appt(B1)).grace_shifts).toBe(1);
  });

  it("when she checks in she goes next, ahead of the walk-in the system had called", async () => {
    await rpc(SECRETARY, "check_in_appointment", [B1]);
    expect(await ready()).toBe(await entryOf(B1));
    expect((await status(W2)).status).toBe("arrived");
    const [b, w] = [await status(await entryOf(B1)), await status(W2)];
    expect(b.position!).toBeLessThan(w.position!);
  });

  it("a Ready patient chosen by staff is never replaced", async () => {
    await act(W2, "mark_ready");
    await rpc(SECRETARY, "open_clinic_session", [null]);
    expect(await ready()).toBe(W2);
    await act(W2, "mark_arrived").catch(() => undefined);
  });

  it("the third time she is passed she becomes Delayed and joins the end as Late", async () => {
    // Clear the floor: finish W1, start and finish everyone present, keep a few walk-ins.
    await act(W1, "finish_consultation");
    const B2 = await bookToday("01077700092", "Booked Two", -25);
    const extra = [await walkIn(3), await walkIn(4), await walkIn(5)];
    for (let i = 0; i < 3; i++) {
      const r = await ready();
      expect(r).toBeTruthy();
      await act(r!, "start_consultation"); // each start calls the next patient
      const a = await appt(B2);
      expect(a.grace_shifts).toBe(i + 1);
      expect(a.delayed_at === null).toBe(i < 2);
      await act(r!, "finish_consultation");
    }
    const board = await rpc(SECRETARY, "get_display_board", []);
    const item = board.booked.find((b: any) => b.name_ar === "Booked Two");
    expect(item).toMatchObject({ grace_shifts: 3, is_delayed: true });

    await rpc(SECRETARY, "check_in_appointment", [B2]);
    const e = await status(await entryOf(B2));
    expect(e.status).toBe("late");
    const { max } = (await as<{ max: number }>("service",
      "select max(position) as max from public.queue_entries where clinic_date = public.clinic_today() and status in ('arrived','ready','late')"))[0]!;
    expect(e.position).toBe(max);
    expect(extra.length).toBe(3);
  });

  it("a booked visitor whose time has not come waits behind walk-ins who came first", async () => {
    const B3 = await bookToday("01077700093", "Booked Three", 180);
    await rpc(SECRETARY, "check_in_appointment", [B3]);
    const { max } = (await as<{ max: number }>("service",
      "select max(position) as max from public.queue_entries where clinic_date = public.clinic_today() and status in ('arrived','ready','late')"))[0]!;
    const b = await status(await entryOf(B3));
    expect(b.status).toBe("arrived");
    expect(b.position).toBe(max);
  });

  describe("staff booking by day", () => {
    let day: string;
    let opening: string;
    beforeAll(async () => {
      const [row] = await as<{ d: string; o: string }>("service", `
        select to_char(d, 'YYYY-MM-DD') as d, to_char(w.start_time, 'HH24:MI') as o
        from generate_series(public.clinic_today() + 2, public.clinic_today() + 30, interval '1 day') d
        join public.clinic_working_days w on w.is_active and w.weekday = extract(dow from d)::smallint
        where not exists (select 1 from public.appointments a where a.clinic_date = d::date)
        order by d, w.start_time limit 1`);
      day = row!.d;
      opening = row!.o;
    });
    const local = async (iso: string) =>
      (await as<{ t: string }>("service", "select to_char($1::timestamptz at time zone 'Africa/Cairo', 'HH24:MI') as t", [iso]))[0]!.t;
    const patient = async (phone: string) =>
      (await as<{ id: string }>("service", "insert into public.patients (full_name, normalized_phone) values ('Staff Booked', $1) returning id", [phone]))[0]!.id;

    it("assigns the opening time, then the next consecutive time", async () => {
      const p1 = await patient("01077700081");
      const p2 = await patient("01077700082");
      const a = await rpc(SECRETARY, "staff_book_appointment_on_date", [p1, day, "ultrasound", null, null]);
      const b = await rpc(SECRETARY, "staff_book_appointment_on_date", [p2, day, "ultrasound", null, null]);
      expect(await local(a.scheduled_start)).toBe(opening);
      expect(new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime()).toBe(20 * 60000);
      await expect(rpc(SECRETARY, "staff_book_appointment_on_date", [p1, day, "ultrasound", null, null])).rejects.toMatchObject({ code: "MQ422" });
      await expect(rpc(VISITOR, "staff_book_appointment_on_date", [p1, day, "ultrasound", null, null])).rejects.toBeTruthy();

      // Moving the first booking on the same day keeps the earliest time free for it.
      const moved = await rpc(SECRETARY, "staff_reschedule_on_date", [a.appointment_id, day]);
      expect(moved.scheduled_start).toBe(a.scheduled_start);
    });
  });

  describe("visit feedback", () => {
    let visit: string;
    beforeAll(async () => {
      const [row] = await as<{ id: string }>("service", `
        insert into public.appointments (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason, status, source, checked_in_at, completed_at)
        select id, public.clinic_today() - 1, null, null, 20, 'ultrasound', 'completed', 'walk_in', now() - interval '25 hours', now() - interval '1 day'
        from public.patients where auth_user_id = '${VISITOR}' returning id`);
      visit = row!.id;
    });

    it("asks once per finished visit and only the doctor reads the answers", async () => {
      const pending = await rpc(VISITOR, "get_pending_feedback", []);
      expect(pending.appointment_id).toBe(visit);
      await expect(rpc(VISITOR, "save_visit_feedback", [visit, 6, null])).rejects.toMatchObject({ code: "MQ422" });
      expect(await rpc(VISITOR, "save_visit_feedback", [visit, 5, "  Very kind  "])).toEqual({ saved: true });
      expect(await rpc(VISITOR, "save_visit_feedback", [visit, null, null])).toEqual({ saved: false });
      expect(await rpc(VISITOR, "get_pending_feedback", [])).toBeNull();
      expect(await as(SECRETARY, "select * from public.visit_feedback")).toHaveLength(0);
      const rows = await as<{ rating: number; comment: string }>(DOCTOR, "select rating, comment from public.visit_feedback");
      expect(rows).toEqual([{ rating: 5, comment: "Very kind" }]);
    });
  });
});
