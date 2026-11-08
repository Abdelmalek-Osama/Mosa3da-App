/**
 * Day-only FIFO booking and services & fees against real PostgreSQL.
 * Run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

// Same doctor id as the other DB suites: only one doctor may exist.
const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000c1";
const V1 = "00000000-0000-0000-0000-0000000000c2";
const V2 = "00000000-0000-0000-0000-0000000000c3";
const V3 = "00000000-0000-0000-0000-0000000000c4";
const V4 = "00000000-0000-0000-0000-0000000000c5";

describe.skipIf(!enabled)("smart clinic features (PostgreSQL)", () => {
  let pool: pg.Pool;
  let day: string;
  let opening: string;

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

  const bookOn = (who: string, date: string, reason = "pregnancy_follow_up") =>
    as<{ r: any }>(who, "select public.book_appointment_on_date($1::date, $2::public.visit_reason) as r", [date, reason]).then((r) => r[0]!.r);
  const local = (iso: string) =>
    as<{ t: string }>("service", "select to_char($1::timestamptz at time zone 'Africa/Cairo', 'HH24:MI') as t", [iso]).then((r) => r[0]!.t);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 6 });
    await as("service", `
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+2010666%');
      delete from public.patients where normalized_phone like '+2010666%';
      delete from auth.users where id in ('${DOCTOR}', '${SECRETARY}', '${V1}', '${V2}', '${V3}', '${V4}');
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}'),
        ('${SECRETARY}', 'sec-smart@test.local', '{"role":"secretary"}', '{"full_name":"Sec Smart"}'),
        ('${V1}', 'v1@test.local', '{}', '{"full_name":"Visitor One"}'),
        ('${V2}', 'v2@test.local', '{}', '{"full_name":"Visitor Two"}'),
        ('${V3}', 'v3@test.local', '{}', '{"full_name":"Visitor Three"}'),
        ('${V4}', 'v4@test.local', '{}', '{"full_name":"Visitor Four"}');
      insert into public.patients (full_name, normalized_phone, auth_user_id, phone_verified_at) values
        ('Visitor One', '01066600001', '${V1}', now()),
        ('Visitor Two', '01066600002', '${V2}', now()),
        ('Visitor Three', '01066600003', '${V3}', now()),
        ('Visitor Four', '01066600004', '${V4}', now());
      update public.visit_reason_settings set default_duration_minutes = 20, is_active = true where reason = 'pregnancy_follow_up';
      update public.visit_reason_settings set default_duration_minutes = 30, is_active = true where reason = 'gynecology';
    `);
    // A Sunday–Thursday at least 2 days away with nothing booked yet.
    const [row] = await as<{ d: string; o: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d, to_char(w.start_time, 'HH24:MI') as o
      from generate_series(public.clinic_today() + 2, public.clinic_today() + 30, interval '1 day') d
      join public.clinic_working_days w on w.is_active and w.weekday = extract(dow from d)::smallint
      where extract(dow from d) between 0 and 4
        and not exists (select 1 from public.appointments a where a.clinic_date = d::date and a.status in ('scheduled', 'checked_in'))
      order by d limit 1`);
    day = row!.d;
    opening = row!.o;
  });

  afterAll(async () => {
    if (!pool) return;
    await as("service", `
      delete from public.queue_entries where patient_id in (select id from public.patients where normalized_phone like '+2010666%');
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+2010666%')`);
    await pool.end();
  });

  it("visitors can no longer pick their own time", async () => {
    await expect(
      as(V1, "select public.book_appointment($1::timestamptz, 'ultrasound'::public.visit_reason)", [`${day}T${opening}:00+02:00`]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("assigns the opening time to the first booking and flags a first-time visitor", async () => {
    const r = await bookOn(V1, day);
    expect(await local(r.scheduled_start)).toBe(opening);
    expect(r.clinic_date).toBe(day);
    expect(r.is_first_booking).toBe(true);
  });

  it("gives the next visitor the next time, back to back", async () => {
    const r = await bookOn(V2, day, "gynecology");
    const [h, m] = opening.split(":").map(Number);
    const expected = new Date(Date.UTC(2000, 0, 1, h!, m! + 20)).toISOString().slice(11, 16);
    expect(await local(r.scheduled_start)).toBe(expected);
    const { minutes } = (await as<{ minutes: number }>("service", "select duration_minutes as minutes from public.appointments where id = $1", [r.appointment_id]))[0]!;
    expect(minutes).toBe(30);
  });

  it("refills a cancelled earlier time first", async () => {
    await as("service", `
      update public.appointments set status = 'cancelled', cancelled_at = now()
      where patient_id = (select id from public.patients where auth_user_id = '${V1}') and clinic_date = '${day}'`);
    const r = await bookOn(V3, day);
    expect(await local(r.scheduled_start)).toBe(opening);
  });

  it("a returning visitor is not first-time", async () => {
    const other = await as<{ d: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d from generate_series('${day}'::date + 1, '${day}'::date + 14, interval '1 day') d
      where extract(dow from d) between 0 and 4 order by d limit 1`);
    const r = await bookOn(V1, other[0]!.d);
    expect(r.is_first_booking).toBe(false);
  });

  it("one booking per visitor per day, closed days and past days are refused", async () => {
    await expect(bookOn(V3, day)).rejects.toMatchObject({ code: "MQ422" });
    const { fri } = (await as<{ fri: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as fri from generate_series(public.clinic_today() + 1, public.clinic_today() + 8, interval '1 day') d
      where extract(dow from d) = 5 limit 1`))[0]!;
    await expect(bookOn(V4, fri)).rejects.toMatchObject({ code: "MQ422" });
    await expect(bookOn(V4, "2020-01-01")).rejects.toMatchObject({ code: "MQ422" });
  });

  it("concurrent confirmations get different, consecutive times", async () => {
    const { d } = (await as<{ d: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d from generate_series('${day}'::date + 1, '${day}'::date + 30, interval '1 day') d
      where extract(dow from d) between 0 and 4
        and not exists (select 1 from public.appointments a where a.clinic_date = d::date and a.status in ('scheduled', 'checked_in'))
      order by d limit 1`))[0]!;
    const [a, b] = await Promise.all([bookOn(V2, d), bookOn(V4, d)]);
    const times = [await local(a.scheduled_start), await local(b.scheduled_start)].sort();
    expect(times[0]).toBe(opening);
    expect(times[0]).not.toBe(times[1]);
  });

  it("reports a full day", async () => {
    const { d } = (await as<{ d: string }>("service", `
      select to_char(d, 'YYYY-MM-DD') as d from generate_series('${day}'::date + 1, '${day}'::date + 30, interval '1 day') d
      where extract(dow from d) between 0 and 4
        and not exists (select 1 from public.appointments a where a.clinic_date = d::date and a.status in ('scheduled', 'checked_in'))
      order by d limit 1`))[0]!;
    // Block the whole day with one long staff booking per period.
    await as("service", `
      insert into public.appointments (patient_id, clinic_date, scheduled_start, scheduled_end, duration_minutes, visit_reason, status, source)
      select (select id from public.patients where auth_user_id = '${V3}'), '${d}'::date,
             public.clinic_local_to_utc('${d}'::date, w.start_time), public.clinic_local_to_utc('${d}'::date, w.end_time),
             least(180, (extract(epoch from (w.end_time - w.start_time)) / 60)::integer), 'ultrasound', 'scheduled', 'staff'
      from public.clinic_working_days w where w.is_active and w.weekday = extract(dow from '${d}'::date)::smallint`);
    await as("service", `
      update public.appointments set scheduled_end = public.clinic_local_to_utc(clinic_date, w.end_time)
      from public.clinic_working_days w
      where appointments.clinic_date = '${d}' and w.is_active and w.weekday = extract(dow from appointments.clinic_date)::smallint`);
    await expect(bookOn(V4, d)).rejects.toMatchObject({ code: "MQ409" });
  });

  it("services: visitors see shown ones only, only the doctor can edit", async () => {
    await as(DOCTOR, "update public.clinic_services set price = 400, is_active = true where name_en = 'Consultation'");
    await as(DOCTOR, "update public.clinic_services set price = 300, is_active = false where name_en = 'Ultrasound (Sonar)'");
    const visible = await as<{ name_en: string; price: string }>(V1, "select name_en, price from public.clinic_services order by sort_order");
    expect(visible).toEqual([{ name_en: "Consultation", price: "400.00" }]);
    const staff = await as(SECRETARY, "select id from public.clinic_services");
    expect(staff.length).toBeGreaterThanOrEqual(2);
    const changed = await as(SECRETARY, "update public.clinic_services set price = 1 returning id");
    expect(changed).toHaveLength(0);
    await expect(as(V1, "insert into public.clinic_services (name_ar, price) values ('اختبار', 1)")).rejects.toBeTruthy();
    await as(DOCTOR, "update public.clinic_services set price = 0, is_active = false");
  });
});
