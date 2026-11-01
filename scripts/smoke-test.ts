/**
 * End-to-end smoke test against YOUR Supabase project (and optionally the running app).
 *
 *   npm run smoke                              → database + auth + RLS checks, plus http://localhost:3000 if it is running
 *   npm run smoke -- --url https://x.vercel.app → also checks a deployed app
 *
 * Uses the demo accounts from npm run setup. It creates one temporary walk-in
 * patient (phone +20109990xxxx) and removes it at the end. Nothing else is changed
 * except a patient booking that is made and cancelled again.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { patientAuthEmail } from "../src/lib/auth/patient-identity";
import { loadEnv } from "./lib/env-file";

const env = loadEnv(".env.local");
const urlArg = process.argv.indexOf("--url");
const APP_URL = (urlArg > 0 ? process.argv[urlArg + 1] : env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY!;

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void | string>) {
  try {
    const note = await fn();
    passed++;
    console.log(`  ✓ ${name}${note ? `  (${note})` : ""}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const client = () => createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_DOCTOR_PASSWORD", "DEMO_SECRETARY_PASSWORD", "DEMO_PATIENT_PASSWORD"]) {
    if (!env[k]) throw new Error(`${k} is missing from .env.local. Run npm run setup first.`);
  }
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const testPhone = `+20109990${String(Date.now()).slice(-4)}`;
  let doctor!: SupabaseClient, secretary!: SupabaseClient, patient!: SupabaseClient;

  console.log(`\nMosa3da smoke test\n  Supabase: ${SUPABASE_URL}\n  App:      ${APP_URL}\n\nPublic`);
  await check("Waiting-room board is public and anonymized", async () => {
    const { data, error } = await client().rpc("get_display_board");
    if (error) throw error;
    const json = JSON.stringify(data);
    assert(!/\+20\d{6,}/.test(json) && !/@/.test(json), "display payload contains a phone number or email");
    return `${(data as { waiting: unknown[] }).waiting.length} waiting`;
  });
  await check("Anonymous visitors cannot read patients", async () => {
    const { data } = await client().from("patients").select("id").limit(1);
    assert(!data || data.length === 0, "anon could read patient rows");
  });

  console.log("\nStaff");
  await check("Doctor signs in", async () => {
    doctor = await signIn(env.DEMO_DOCTOR_EMAIL || "doctor@mosa3da.app", env.DEMO_DOCTOR_PASSWORD!);
  });
  await check("Secretary signs in", async () => {
    secretary = await signIn(env.DEMO_SECRETARY_EMAIL || "secretary@mosa3da.app", env.DEMO_SECRETARY_PASSWORD!);
  });
  await check("Inactive secretary is rejected", async () => {
    const { error } = await client().auth.signInWithPassword({ email: "former.secretary@mosa3da.app", password: env.DEMO_SECRETARY_PASSWORD! });
    assert(error, "inactive secretary could sign in");
  });
  await check("Today's session opens and lists the queue", async () => {
    const { error } = await secretary.rpc("open_clinic_session", { p_date: null });
    if (error) throw error;
    const { data, error: e2 } = await secretary.from("queue_entries").select("id, status").eq("clinic_date", (await secretary.rpc("clinic_today")).data);
    if (e2) throw e2;
    return `${data!.length} entries today`;
  });

  let entryId = "";
  await check("Secretary registers a walk-in (new patient) with number and expected time", async () => {
    const { data, error } = await secretary.rpc("register_walk_in", {
      p_full_name: "Smoke Test Patient",
      p_phone: testPhone,
      p_visit_reason: "gynecology",
      p_visit_reason_details: null,
      p_duration_minutes: 15,
      p_notes: "Automated smoke test",
      p_patient_id: null,
    });
    if (error) throw error;
    const r = data as { queue_entry_id: string; queue_number: number; expected_start_at: string | null };
    entryId = r.queue_entry_id;
    assert(r.queue_number > 0 && r.expected_start_at, "no queue number / expected time");
    return `#${r.queue_number}`;
  });
  await check("Queue transitions are enforced (cancel the test walk-in)", async () => {
    const { error } = await secretary.rpc("queue_transition", { p_entry_id: entryId, p_action: "cancel", p_expected_version: null, p_reason: "smoke test" });
    if (error) throw error;
  });
  await check("Secretary cannot change working hours", async () => {
    const { error } = await secretary.rpc("save_working_days", { p_periods: [] });
    assert(error?.code === "MQ403", `expected MQ403, got ${error?.code ?? "success"}`);
  });
  await check("Secretary cannot change clinic settings", async () => {
    const { data } = await secretary.from("doctor_settings").update({ whatsapp_threshold_minutes: 5 }).eq("id", 1).select("id");
    assert(!data || data.length === 0, "secretary updated doctor settings");
  });
  await check("Doctor can read settings and working hours", async () => {
    const { data, error } = await doctor.from("clinic_working_days").select("weekday").eq("is_active", true);
    if (error) throw error;
    assert(data!.length > 0, "no working hours configured");
    return `${data!.length} periods`;
  });

  console.log("\nPatient");
  await check("Demo patient signs in with phone + password", async () => {
    patient = await signIn(patientAuthEmail("+201001234561"), env.DEMO_PATIENT_PASSWORD!);
  });
  await check("Patient sees only her own appointments", async () => {
    const { data, error } = await patient.from("appointments").select("patient_id");
    if (error) throw error;
    assert(new Set(data!.map((r) => r.patient_id)).size <= 1, "patient can see other patients' appointments");
    const { data: others } = await patient.from("patients").select("id");
    assert((others ?? []).length <= 1, "patient can see other patient records");
  });
  await check("Patient cannot use staff actions", async () => {
    const { error } = await patient.rpc("register_walk_in", { p_full_name: "x", p_phone: "01000000000", p_visit_reason: "other", p_visit_reason_details: "x", p_duration_minutes: 10, p_notes: null, p_patient_id: null });
    assert(error, "patient could register a walk-in");
  });
  await check("Patient books a free slot and cancels it", async () => {
    const { data: cal, error } = await patient.rpc("get_booking_calendar");
    if (error) throw error;
    const { data: mine } = await patient.from("appointments").select("clinic_date").in("status", ["scheduled", "checked_in"]);
    const busy = new Set((mine ?? []).map((a) => a.clinic_date));
    const day = (cal as { dates: { date: string; free: number }[] }).dates.slice(2).find((d) => d.free > 0 && !busy.has(d.date));
    assert(day, "no bookable day found in the booking window");
    const { data: slots } = await patient.rpc("get_available_slots", { p_date: day.date });
    const slot = (slots as { slot_start: string; available: boolean }[]).find((s) => s.available)!;
    const { data: booked, error: e2 } = await patient.rpc("book_appointment", { p_slot_start: slot.slot_start, p_visit_reason: "ultrasound", p_visit_reason_details: null, p_notes: "smoke test" });
    if (e2) throw e2;
    const id = (booked as { appointment_id: string }).appointment_id;
    const { error: e3 } = await secretary.rpc("staff_cancel_appointment", { p_appointment_id: id, p_reason: "smoke test" });
    if (e3) throw e3;
    return `${day.date} ${new Date(slot.slot_start).toISOString().slice(11, 16)}Z`;
  });

  console.log("\nApp");
  const reachable = await fetch(`${APP_URL}/api/health`).then((r) => r.ok).catch(() => false);
  if (!reachable) {
    console.log(`  - ${APP_URL} is not running, skipped (start it with npm run dev and run npm run smoke again)`);
  } else {
    await check("/api/health reports the database as ok", async () => {
      const j = await (await fetch(`${APP_URL}/api/health`)).json();
      assert(j.ok, JSON.stringify(j));
    });
    for (const p of ["/", "/login", "/patient/login", "/patient/register", "/display"]) {
      await check(`GET ${p}`, async () => {
        const r = await fetch(`${APP_URL}${p}`, { redirect: "manual" });
        assert(r.status === 200 || r.status === 307, `status ${r.status}`);
      });
    }
    await check("Admin pages redirect anonymous visitors to /login", async () => {
      const r = await fetch(`${APP_URL}/admin/dashboard`, { redirect: "manual" });
      assert(r.status === 307 && (r.headers.get("location") ?? "").includes("/login"), `status ${r.status}`);
    });
    await check("Cron endpoint rejects calls without CRON_SECRET", async () => {
      const r = await fetch(`${APP_URL}/api/cron/notifications`);
      assert(r.status === 401 || r.status === 403, `status ${r.status}`);
    });
  }

  // Cleanup the temporary walk-in patient.
  const { data: tp } = await admin.from("patients").select("id").eq("normalized_phone", testPhone).maybeSingle();
  if (tp) {
    await admin.from("notification_logs").delete().eq("patient_id", tp.id);
    await admin.from("queue_entries").delete().eq("patient_id", tp.id);
    await admin.from("appointments").delete().eq("patient_id", tp.id);
    await admin.from("patients").delete().eq("id", tp.id);
  }

  console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n  ✗ ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
