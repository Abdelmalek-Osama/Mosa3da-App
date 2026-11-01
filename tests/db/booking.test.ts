/**
 * Patient booking against real PostgreSQL. Run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

const P1 = "00000000-0000-0000-0000-0000000000b1";
const P2 = "00000000-0000-0000-0000-0000000000b2";
const NOBODY = "00000000-0000-0000-0000-0000000000b3";

describe.skipIf(!enabled)("patient booking (PostgreSQL)", () => {
  let pool: pg.Pool;
  let day: string;

  async function as<T = any>(who: string | "anon" | "service", sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      if (who === "anon") await c.query("set local role anon");
      else if (who === "service") await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
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

  const slots = (who: string) =>
    as<{ slot_start: Date; available: boolean; local: string }>(
      who,
      `select slot_start, available, to_char(slot_start at time zone 'Africa/Cairo', 'HH24:MI') as local
       from public.get_available_slots($1::date)`,
      [day],
    );
  const book = (who: string, start: Date | string, reason = "ultrasound") =>
    as(who, "select public.book_appointment($1::timestamptz, $2::public.visit_reason) as r", [start, reason]).then((r) => r[0].r);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await as("service", `
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+2010888%');
      delete from public.patients where normalized_phone like '+2010888%';
      delete from auth.users where id in ('${P1}', '${P2}', '${NOBODY}');
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${P1}', 'b1@test.local', '{"full_name":"Booker One"}'),
        ('${P2}', 'b2@test.local', '{"full_name":"Booker Two"}'),
        ('${NOBODY}', 'b3@test.local', '{"full_name":"No Patient Row"}');
      insert into public.patients (full_name, normalized_phone, auth_user_id, phone_verified_at) values
        ('Booker One', '01088800001', '${P1}', now()),
        ('Booker Two', '01088800002', '${P2}', now());
    `);
    // Next Sunday–Thursday at least 2 days away (cutoff-safe).
    const [row] = await as<{ d: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d from generate_series(public.clinic_today() + 2, public.clinic_today() + 9, interval '1 day') d
      where extract(dow from d) between 0 and 4 order by d limit 1`);
    day = row!.d;
  });

  afterAll(async () => pool?.end());

  it("calendar lists working days only (no Fridays)", async () => {
    const r = (await as<{ r: any }>(P1, "select public.get_booking_calendar() as r"))[0]!.r;
    expect(r.timezone).toBe("Africa/Cairo");
    const dows = r.dates.map((d: any) => new Date(`${d.date}T12:00:00Z`).getUTCDay());
    expect(dows).not.toContain(5);
    expect(r.dates.some((d: any) => d.date === day && d.free > 0)).toBe(true);
  });

  it("generates 20-minute slots inside working hours", async () => {
    const s = await slots(P1);
    expect(s[0]!.local).toBe("14:30");
    expect(s.at(-1)!.local).toBe("18:10");
    expect(s).toHaveLength(12);
    expect(s.every((x) => x.available)).toBe(true);
  });

  it("books a slot and blocks it for everyone else", async () => {
    const s = await slots(P1);
    const res = await book(P1, s[0]!.slot_start);
    expect(res.appointment_id).toBeTruthy();
    expect((await slots(P2))[0]!.available).toBe(false);
    await expect(book(P2, s[0]!.slot_start)).rejects.toMatchObject({ code: "MQ409" });
  });

  it("prevents a second booking for the same patient on the same day", async () => {
    const s = await slots(P1);
    await expect(book(P1, s[3]!.slot_start)).rejects.toMatchObject({ code: "MQ422" });
  });

  it("rejects times outside working hours", async () => {
    await expect(book(P2, `${day}T14:35:00+02:00`)).rejects.toMatchObject({ code: "MQ422" });
    await expect(book(P2, `${day}T21:00:00+02:00`)).rejects.toMatchObject({ code: "MQ422" });
  });

  it("only the owner can cancel, and the slot frees up", async () => {
    const id = (await as<{ id: string }>("service", "select a.id from public.appointments a join public.patients p on p.id = a.patient_id where p.auth_user_id = $1", [P1]))[0]!.id;
    await expect(as(P2, "select public.cancel_my_appointment($1)", [id])).rejects.toMatchObject({ code: "MQ404" });
    await as(P1, "select public.cancel_my_appointment($1, 'Travelling')", [id]);
    expect((await slots(P2))[0]!.available).toBe(true);
  });

  it("patients only see their own appointments", async () => {
    const s = await slots(P2);
    await book(P2, s[1]!.slot_start, "postpartum");
    const mine = await as(P1, "select id from public.appointments");
    const theirs = await as(P2, "select id from public.appointments where status = 'scheduled'");
    expect(mine.every(Boolean)).toBe(true);
    expect(theirs).toHaveLength(1);
    expect(mine).toHaveLength(1); // P1's cancelled one only
  });

  it("requires a verified patient and a signed-in user", async () => {
    const s = await slots(P1);
    await expect(book(NOBODY, s[5]!.slot_start)).rejects.toMatchObject({ code: "MQ403" });
    await expect(as("anon", "select * from public.get_available_slots(current_date)")).rejects.toMatchObject({ code: "42501" });
  });
});
