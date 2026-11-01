/**
 * Admin workspace RPCs against real PostgreSQL. Run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

// Same doctor id as queue-engine.test.ts: only one doctor may exist.
const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000a1";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000a2";

describe.skipIf(!enabled)("admin workspace (PostgreSQL)", () => {
  let pool: pg.Pool;
  let futureDay: string;
  let patientId: string;
  let savedHours: { weekday: number; start_time: string; end_time: string }[];

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

  const slotsFor = (day: string) =>
    as<{ slot_start: Date; available: boolean }>(SECRETARY, "select slot_start, available from public.get_available_slots($1::date)", [day]);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await as("service", `
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+2010777%');
      delete from public.patients where normalized_phone like '+2010777%';
      delete from auth.users where id in ('${DOCTOR}', '${SECRETARY}', '${PATIENT_USER}');
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}'),
        ('${SECRETARY}', 'sec-admin@test.local', '{"role":"secretary"}', '{"full_name":"Sec Admin"}'),
        ('${PATIENT_USER}', 'pa@test.local', '{}', '{"full_name":"Plain Patient"}');
    `);
    savedHours = await as("service", "select weekday, to_char(start_time,'HH24:MI') start_time, to_char(end_time,'HH24:MI') end_time from public.clinic_working_days where is_active");
    const [row] = await as<{ d: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d from generate_series(public.clinic_today() + 2, public.clinic_today() + 9, interval '1 day') d
      where extract(dow from d) between 0 and 4 order by d limit 1`);
    futureDay = row!.d;
  });

  afterAll(async () => {
    await as(
      "service",
      `delete from public.clinic_working_days where true;
       insert into public.clinic_working_days (weekday, start_time, end_time)
       select (p->>'weekday')::smallint, (p->>'start_time')::time, (p->>'end_time')::time
       from jsonb_array_elements('${JSON.stringify(savedHours)}'::jsonb) p;`,
    );
    await as("service", `
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+2010777%');
      delete from public.patients where normalized_phone like '+2010777%';
      delete from auth.users where id in ('${DOCTOR}', '${SECRETARY}', '${PATIENT_USER}');`);
    await pool?.end();
  });

  it("staff can register a patient and duplicates are rejected in any phone format", async () => {
    const [p] = await as<{ id: string }>(SECRETARY, "insert into public.patients (full_name, normalized_phone) values ('Admin Test', '01077700001') returning id");
    patientId = p!.id;
    await expect(as(SECRETARY, "insert into public.patients (full_name, normalized_phone) values ('Dup', '+20 10 7770 0001')")).rejects.toMatchObject({ code: "23505" });
    await expect(as(PATIENT_USER, "insert into public.patients (full_name, normalized_phone) values ('Nope', '01077700009')")).rejects.toBeTruthy();
  });

  it("staff books for a patient, the slot is taken, and staff can cancel", async () => {
    const s = (await slotsFor(futureDay)).filter((x) => x.available);
    const [r] = await as<{ r: any }>(SECRETARY, "select public.staff_book_appointment($1, $2, 'ultrasound') as r", [patientId, s[0]!.slot_start]);
    expect(r!.r.appointment_id).toBeTruthy();
    const after = await slotsFor(futureDay);
    expect(after.find((x) => +x.slot_start === +s[0]!.slot_start)!.available).toBe(false);
    await expect(as(SECRETARY, "select public.staff_book_appointment($1, $2, 'ultrasound')", [patientId, s[1]!.slot_start])).rejects.toMatchObject({ code: "MQ422" });
    await expect(as(PATIENT_USER, "select public.staff_book_appointment($1, $2, 'ultrasound')", [patientId, s[2]!.slot_start])).rejects.toMatchObject({ code: "MQ403" });

    await as(SECRETARY, "select public.staff_cancel_appointment($1, 'Rescheduled')", [r!.r.appointment_id]);
    const [a] = await as<{ status: string }>("service", "select status from public.appointments where id = $1", [r!.r.appointment_id]);
    expect(a!.status).toBe("cancelled");
    await expect(as(SECRETARY, "select public.staff_cancel_appointment($1)", [r!.r.appointment_id])).rejects.toMatchObject({ code: "MQ409" });
  });

  it("future appointments cannot be checked in", async () => {
    const s = (await slotsFor(futureDay)).filter((x) => x.available);
    const [r] = await as<{ r: any }>(SECRETARY, "select public.staff_book_appointment($1, $2, 'gynecology') as r", [patientId, s[0]!.slot_start]);
    await expect(as(SECRETARY, "select public.check_in_appointment($1)", [r!.r.appointment_id])).rejects.toMatchObject({ code: "MQ409" });
  });

  it("only the doctor can replace working hours, and overlaps are rejected", async () => {
    const hours = [
      { weekday: 0, start_time: "14:30", end_time: "18:30" },
      { weekday: 6, start_time: "10:00", end_time: "13:00" },
      { weekday: 6, start_time: "17:00", end_time: "20:00" },
    ];
    await expect(as(SECRETARY, "select public.save_working_days($1::jsonb)", [JSON.stringify(hours)])).rejects.toMatchObject({ code: "MQ403" });
    const [n] = await as<{ n: number }>(DOCTOR, "select public.save_working_days($1::jsonb) as n", [JSON.stringify(hours)]);
    expect(n!.n).toBe(3);
    await expect(
      as(DOCTOR, "select public.save_working_days($1::jsonb)", [JSON.stringify([...hours, { weekday: 0, start_time: "18:00", end_time: "19:00" }])]),
    ).rejects.toMatchObject({ code: "MQ422" });
    const [c] = await as<{ c: number }>("service", "select count(*)::int c from public.clinic_working_days where is_active");
    expect(c!.c).toBe(3); // failed save rolled back entirely
  });

  it("doctor can update settings, secretary cannot, and the doctor can deactivate a secretary", async () => {
    await as(DOCTOR, "update public.doctor_settings set whatsapp_threshold_minutes = 45 where id = 1");
    const res = await as(SECRETARY, "update public.doctor_settings set whatsapp_threshold_minutes = 5 where id = 1 returning id");
    expect(res).toHaveLength(0);
    const [s] = await as<{ w: number }>("service", "select whatsapp_threshold_minutes w from public.doctor_settings where id = 1");
    expect(s!.w).toBe(45);
    await as("service", "update public.doctor_settings set whatsapp_threshold_minutes = 30 where id = 1");

    await expect(as(SECRETARY, `update public.profiles set is_active = false where id = '${SECRETARY}'`)).rejects.toBeTruthy();
    await as(DOCTOR, `update public.profiles set is_active = false where id = '${SECRETARY}'`);
    const [p] = await as<{ a: boolean }>("service", `select is_active a from public.profiles where id = '${SECRETARY}'`);
    expect(p!.a).toBe(false);
  });
});
