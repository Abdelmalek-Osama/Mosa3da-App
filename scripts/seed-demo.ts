/**
 * Demo environment seed.
 *   npm run seed:demo          → idempotent: accounts + appointments + today's queue
 *   npm run seed:demo:reset    → also clears TODAY's demo session first
 *
 * Requires supabase/migrations applied and supabase/seed.sql loaded.
 * Only touches demo accounts / demo phone numbers; refuses to reset when
 * NODE_ENV=production unless --i-know-this-is-production is passed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { patientAuthEmail } from "../src/lib/auth/patient-identity";

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

const DOCTOR = { email: env("DEMO_DOCTOR_EMAIL", "doctor@mosa3da.app"), password: env("DEMO_DOCTOR_PASSWORD"), name: "د. رودينا مدحت" };
const SECRETARY = { email: env("DEMO_SECRETARY_EMAIL", "secretary@mosa3da.app"), password: env("DEMO_SECRETARY_PASSWORD"), name: "Heba Mostafa" };
const INACTIVE_SECRETARY = { email: "former.secretary@mosa3da.app", password: env("DEMO_SECRETARY_PASSWORD"), name: "Rania Adel" };
const PATIENT_PASSWORD = env("DEMO_PATIENT_PASSWORD");
type DemoPatient = { id: string; full_name: string; normalized_phone: string };
const PATIENT_WITH_ACCOUNT = "+201001234561"; // Mariam Ahmed Hassan

const DEMO_PHONES = [
  "+201001234561", "+201001234562", "+201101234563", "+201201234564", "+201501234565",
  "+201001234566", "+201101234567", "+201201234568", "+201501234569", "+201001234570",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must<T = any>(label: string, promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  return data as T;
}

async function findUserByEmail(email: string) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(opts: {
  email: string; password: string; fullName: string; role: "doctor" | "secretary" | "patient"; active?: boolean; phone?: string;
}) {
  const existing = await findUserByEmail(opts.email);
  const appMeta = { role: opts.role, is_active: opts.active ?? true };
  const userMeta = { full_name: opts.fullName, phone: opts.phone };

  const user = existing
    ? (await must("updateUser", db.auth.admin.updateUserById(existing.id, {
        password: opts.password, app_metadata: appMeta, user_metadata: userMeta,
        ban_duration: opts.active === false ? "876000h" : "none",
      }))).user
    : (await must("createUser", db.auth.admin.createUser({
        email: opts.email, password: opts.password, email_confirm: true,
        app_metadata: appMeta, user_metadata: userMeta,
        ban_duration: opts.active === false ? "876000h" : undefined,
      }))).user;

  // Trigger created the profile; enforce role/state in case it pre-existed.
  await must("profile", db.from("profiles").update({
    role: opts.role, full_name: opts.fullName, is_active: opts.active ?? true,
  }).eq("id", user.id));
  return user.id;
}

async function clinicUtc(date: string, time: string): Promise<string> {
  return must("clinic_local_to_utc", db.rpc("clinic_local_to_utc", { p_date: date, p_time: time }));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (RESET && process.env.NODE_ENV === "production" && !args.has("--i-know-this-is-production")) {
    throw new Error("Refusing to reset in production.");
  }

  console.log("→ Accounts");
  const doctorId = await ensureUser({ email: DOCTOR.email, password: DOCTOR.password, fullName: DOCTOR.name, role: "doctor" });
  await ensureUser({ email: SECRETARY.email, password: SECRETARY.password, fullName: SECRETARY.name, role: "secretary" });
  await ensureUser({ email: INACTIVE_SECRETARY.email, password: INACTIVE_SECRETARY.password, fullName: INACTIVE_SECRETARY.name, role: "secretary", active: false });
  await must("settings", db.from("doctor_settings").update({ doctor_profile_id: doctorId }).eq("id", 1));

  const patients = await must<DemoPatient[]>("patients", db.from("patients").select("id, full_name, normalized_phone").in("normalized_phone", DEMO_PHONES));
  if (patients.length < DEMO_PHONES.length) throw new Error("Run supabase/seed.sql first (demo patients missing).");
  const byPhone = new Map(patients.map((p) => [p.normalized_phone, p]));

  const mariam = byPhone.get(PATIENT_WITH_ACCOUNT)!;
  const patientUserId = await ensureUser({
    email: patientAuthEmail(PATIENT_WITH_ACCOUNT), password: PATIENT_PASSWORD,
    fullName: mariam.full_name, role: "patient", phone: PATIENT_WITH_ACCOUNT,
  });
  await must("link patient", db.from("patients").update({ auth_user_id: patientUserId, phone_verified_at: new Date().toISOString() }).eq("id", mariam.id));

  const today: string = await must("clinic_today", db.rpc("clinic_today"));
  const ids = patients.map((p) => p.id);

  if (RESET) {
    console.log("→ Reset today's demo queue");
    await must("del notifications", db.from("notification_logs").delete().in("patient_id", ids));
    await must("del session", db.from("clinic_sessions").delete().eq("clinic_date", today));
    await must("del appointments", db.from("appointments").delete().in("patient_id", ids).gte("clinic_date", today));
  }

  console.log("→ Future appointments");
  const future: Array<[string, number, string, string]> = [
    [PATIENT_WITH_ACCOUNT, 1, "15:10", "routine_antenatal"],
    ["+201201234568", 1, "15:50", "ultrasound_4d"],
    ["+201501234569", 2, "14:30", "postpartum"],
    ["+201001234570", 3, "16:10", "pregnancy_confirmation"],
  ];
  for (const [phone, offset, time, reason] of future) {
    const date = addDays(today, offset);
    const patientId = byPhone.get(phone)!.id;
    const existing = await must<Array<{ id: string }>>("appt check", db.from("appointments").select("id").eq("patient_id", patientId).eq("clinic_date", date).in("status", ["scheduled", "checked_in"]));
    if (existing.length) continue;
    const start = await clinicUtc(date, time);
    const end = new Date(new Date(start).getTime() + 20 * 60_000).toISOString();
    const { error } = await db.from("appointments").insert({
      patient_id: patientId, clinic_date: date, scheduled_start: start, scheduled_end: end,
      duration_minutes: 20, visit_reason: reason, status: "scheduled", source: "staff", booked_by: doctorId,
    });
    if (error) console.warn(`  skip ${phone} ${date}: ${error.message}`);
  }

  const existingSession = await must("session check", db.from("clinic_sessions").select("id").eq("clinic_date", today).maybeSingle());
  if (existingSession) {
    console.log("→ Today's queue already exists (use --reset to rebuild)");
  } else {
    console.log("→ Today's queue");
    // One booked appointment today that has not checked in yet (Scheduled).
    const scheduledStart = await clinicUtc(today, "17:30");
    await must("today booking", db.from("appointments").insert({
      patient_id: byPhone.get("+201101234567")!.id, clinic_date: today, scheduled_start: scheduledStart,
      scheduled_end: new Date(new Date(scheduledStart).getTime() + 20 * 60_000).toISOString(),
      duration_minutes: 20, visit_reason: "pregnancy_follow_up", status: "scheduled", source: "patient_portal",
    }));

    const walkIns: Array<[string, string, number]> = [
      ["+201001234562", "pregnancy_follow_up", 15], // → Finished
      ["+201101234563", "ultrasound", 20],          // → Current
      [PATIENT_WITH_ACCOUNT, "routine_antenatal", 20], // → Ready
      ["+201201234564", "gynecology", 20],          // → Late (manual)
      ["+201501234565", "ultrasound_4d", 30],
      ["+201001234566", "pregnancy_confirmation", 15],
    ];
    const entryIds: string[] = [];
    for (const [phone, reason, minutes] of walkIns) {
      const res = await must<{ queue_entry_id: string }>("walk-in", db.rpc("register_walk_in", {
        p_full_name: null, p_phone: null, p_visit_reason: reason, p_duration_minutes: minutes,
        p_patient_id: byPhone.get(phone)!.id,
      }));
      entryIds.push(res.queue_entry_id);
    }
    const t = (id: string, action: string) => must(action, db.rpc("queue_transition", { p_entry_id: id, p_action: action }));
    await t(entryIds[0]!, "start_consultation");
    await t(entryIds[0]!, "finish_consultation");
    await t(entryIds[1]!, "start_consultation");
    await t(entryIds[3]!, "mark_late");
    // entryIds[2] (Mariam) is Ready automatically.
  }

  console.log("→ Notifications");
  // Free mode: rows wait on the dashboard for staff to tap Send. Nothing is sent here.
  await must("enqueue turn alerts", db.rpc("enqueue_due_notifications", { p_channel: "whatsapp_link" }));
  await must("enqueue appointment reminders", db.rpc("enqueue_appointment_reminders", { p_channel: "whatsapp_link" }));

  console.log("\n✓ Demo ready");
  console.log(`  Doctor:     ${DOCTOR.email}`);
  console.log(`  Secretary:  ${SECRETARY.email}`);
  console.log(`  Inactive:   ${INACTIVE_SECRETARY.email} (login must be rejected)`);
  console.log(`  Patient:    ${PATIENT_WITH_ACCOUNT} (phone login)`);
  console.log("  Passwords:  from DEMO_*_PASSWORD in .env.local");
}

main().catch((error) => {
  console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
