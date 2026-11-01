/**
 * WhatsApp reminders (migration 0006) against real PostgreSQL. Run after tests/db/setup-local.sh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && !/supabase\.(co|com)/.test(url);

const DOCTOR = "00000000-0000-0000-0000-0000000000d0";
const SECRETARY = "00000000-0000-0000-0000-0000000000b1";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000b2";
const PATIENT_EN_USER = "00000000-0000-0000-0000-0000000000b3";

describe.skipIf(!enabled)("whatsapp reminders (PostgreSQL)", () => {
  let pool: pg.Pool;
  const appt: Record<string, string> = {};

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

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await as("service", `
      delete from public.notification_logs where patient_id in (select id from public.patients where normalized_phone like '+9665550%');
      delete from public.appointments where patient_id in (select id from public.patients where normalized_phone like '+9665550%');
      delete from public.patients where normalized_phone like '+9665550%';
      delete from auth.users where id in ('${SECRETARY}', '${PATIENT_USER}', '${PATIENT_EN_USER}');
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${DOCTOR}', 'doc@test.local', '{"role":"doctor"}', '{"full_name":"Dr Test"}') on conflict (id) do nothing;
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
        ('${SECRETARY}', 'sec-wa@test.local', '{"role":"secretary"}', '{"full_name":"Sec WA"}'),
        ('${PATIENT_USER}', 'wa1@test.local', '{"role":"patient"}', '{"full_name":"Noura"}'),
        ('${PATIENT_EN_USER}', 'wa2@test.local', '{"role":"patient"}', '{"full_name":"Sara"}');
      update public.profiles set is_active = true where id in ('${PATIENT_USER}', '${PATIENT_EN_USER}');
      insert into public.patients (full_name, normalized_phone, auth_user_id, preferred_locale) values
        ('نورة أحمد', '+966555000001', '${PATIENT_USER}', 'ar'),
        ('Sara Ali', '+966555000002', '${PATIENT_EN_USER}', 'en'),
        ('Walk In', '+966555000003', null, 'ar');
    `);
    const rows = await as<{ id: string; phone: string }>("service", `
      insert into public.appointments (patient_id, clinic_date, scheduled_start, scheduled_end, visit_reason, source)
      select p.id, public.clinic_today() + 1,
             ((public.clinic_today() + 1)::timestamp + time '10:00' + (row_number() over (order by p.normalized_phone)) * interval '20 minutes')
               at time zone public._clinic_timezone(),
             ((public.clinic_today() + 1)::timestamp + time '10:20' + (row_number() over (order by p.normalized_phone)) * interval '20 minutes')
               at time zone public._clinic_timezone(),
             'gynecology', 'staff'
      from public.patients p where p.normalized_phone like '+9665550%'
      returning id, (select normalized_phone from public.patients where id = patient_id) as phone`);
    for (const r of rows) appt[r.phone] = r.id;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("cron reminders go only to patients with an account, in their language, once", async () => {
    const first = await as("service", "select * from public.enqueue_appointment_reminders()");
    const mine = first.filter((r: any) => r.recipient_phone.startsWith("+9665550"));
    expect(mine.map((r: any) => r.recipient_phone).sort()).toEqual(["+966555000001", "+966555000002"]);
    const ar = mine.find((r: any) => r.recipient_phone === "+966555000001");
    const en = mine.find((r: any) => r.recipient_phone === "+966555000002");
    expect(ar.message_body).toMatch(/^مرحبًا نورة، نذكّركِ بموعدكِ في .+ يوم .+ الساعة \d\d:\d\d\./);
    expect(en.message_body).toMatch(/^Hello Sara, this is a reminder of your appointment at .+ on \w+ \d\d \w+ \d{4} at \d\d:\d\d\./);
    expect(en.template_params).toHaveLength(4);
    expect(ar.channel).toBe("whatsapp_link");
    const second = await as("service", "select * from public.enqueue_appointment_reminders()");
    expect(second.filter((r: any) => r.recipient_phone.startsWith("+9665550"))).toHaveLength(0);
  });

  it("patients and anonymous callers cannot enqueue", async () => {
    await expect(as(PATIENT_USER, "select * from public.enqueue_appointment_reminders()")).rejects.toThrow(/permission denied/);
    await expect(as(PATIENT_USER, "select public.queue_appointment_reminder($1)", [appt["+966555000003"]])).rejects.toThrow();
  });

  it("staff can create a reminder for any scheduled appointment and gets the same row twice", async () => {
    const [a] = await as(SECRETARY, "select (public.queue_appointment_reminder($1)).*", [appt["+966555000003"]]);
    const [b] = await as(SECRETARY, "select (public.queue_appointment_reminder($1)).*", [appt["+966555000003"]]);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("pending");
    expect(a.opened_at).toBeNull();
  });

  it("opening a link records who opened it but never marks it sent", async () => {
    const [row] = await as("service", "select id from public.notification_logs where recipient_phone = '+966555000003'");
    const [opened] = await as(SECRETARY, "select (public.mark_notification_opened($1)).*", [row.id]);
    expect(opened.opened_by).toBe(SECRETARY);
    expect(opened.opened_at).not.toBeNull();
    expect(opened.status).toBe("pending");
    expect(opened.sent_at).toBeNull();
    await expect(as(PATIENT_USER, "select public.mark_notification_opened($1)", [row.id])).rejects.toThrow();
  });

  it("cancelled appointments cannot get a reminder", async () => {
    await as("service", "update public.appointments set status = 'cancelled', cancelled_at = now() where id = $1", [appt["+966555000002"]]);
    await expect(as(SECRETARY, "select public.queue_appointment_reminder($1)", [appt["+966555000002"]])).rejects.toThrow(/Only scheduled appointments/);
  });

  it("patients can change their own preferred language", async () => {
    await as(PATIENT_USER, "update public.patients set preferred_locale = 'en' where auth_user_id = $1", [PATIENT_USER]);
    const [p] = await as("service", "select preferred_locale from public.patients where auth_user_id = $1", [PATIENT_USER]);
    expect(p.preferred_locale).toBe("en");
  });
});
