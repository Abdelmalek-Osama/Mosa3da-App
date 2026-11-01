# Mosa3da (مساعدة) — clinic queue POC

Next.js 14 + Supabase. Staff app at `/admin`, patient portal at `/patient`, waiting-room TV at `/display`.

## Run it locally (about 10 minutes)

**1. Prerequisites:** Node.js 20.9+ and a Supabase project.

**2. Environment.** Copy `.env.example` to `.env.local` and fill in:

| Key | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` / secret key. **Server only.** |
| `DATABASE_URL` | Supabase → Connect → **Session pooler** URI (port 5432, user `postgres.<ref>`). The direct `db.<ref>.supabase.co` host is IPv6-only and fails on many home networks. |

You can leave `CRON_SECRET`, `OTP_PEPPER` and the `DEMO_*` values empty. Setup generates them.

**3. Install and set up the database**

```bash
npm install
npm run setup
```

`setup` checks your env, applies the 6 migrations in `supabase/migrations` (it skips ones that are already applied), loads the demo data, creates the demo accounts, and prints the logins. You can run it again safely. Add `-- --yes` to skip the confirmation prompt.

**4. Start the app and check it**

```bash
npm run dev          # http://localhost:3000
npm run smoke        # in a second terminal: 23 end-to-end checks against the running app
```

Every line of `npm run smoke` should show ✓. A ✗ prints the reason.

## Demo logins

`setup` prints these and saves the passwords in `.env.local`:

- **Doctor:** `doctor@mosa3da.app` at `/login`. Full access, including Clinic settings and Secretaries.
- **Secretary:** `secretary@mosa3da.app` at `/login`. Queue, appointments, patients. Settings are read-only.
- **Patient:** phone `01001234561` at `/patient/login` (password is `DEMO_PATIENT_PASSWORD`).
- **TV screen:** `/display` needs no login and shows only the queue number and first name.

## Demo script (5 minutes)

1. As the doctor, open **Today's queue**. Use Start, Finish, Skip and Absent, then add a walk-in.
2. Open `/display` in another window. It updates live.
3. Go to **Appointments** and book a patient for today, then **Check in**. They join the queue.
4. In **Patients**, search by name or phone, open a patient and see their visit history.
5. In **Clinic settings**, change working hours or the slot length.
6. In **Secretaries**, create an account, then deactivate it. That person can no longer sign in.
7. On a phone, register a new patient at `/patient/register`. In demo mode the code appears on screen and nothing is sent. With free WhatsApp mode on, the patient taps "Send the code on WhatsApp" and the page continues by itself. Book a slot, see the live position, then cancel.
8. On the dashboard, **WhatsApp reminders** lists turn alerts and tomorrow's appointment reminders. Tap **Send** to open WhatsApp with the message ready, then press Send there. On **Appointments**, each booking has a **WhatsApp reminder** button.
9. Use the sun/moon button for light or dark mode and the language button for العربية / English. Arabic is the default.

## Tests

```bash
npm run typecheck && npm test        # 35 unit tests
TEST_DATABASE_URL=... npm run test:db # 32 DB tests. Use a throwaway database only, never production.
```

## Deploy to Vercel

`npm run build` needs `NEXT_PUBLIC_SUPABASE_URL` and a Supabase key to be set. It fails fast without them.

1. Import the folder, then add every key from `.env.local` as an env var, **except** the `DEMO_*_PASSWORD` keys and `TEST_DATABASE_URL`.
2. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL, and set `DEMO_OTP_DISPLAY=true` so the mock code still shows.
3. `vercel.json` schedules `/api/cron/notifications` daily. Vercel sends `CRON_SECRET` automatically.

## Known POC limits

- WhatsApp has three modes (see `docs/whatsapp.md`). **Demo**, the default: codes are shown on screen and nothing is sent. **Free**: patients send their own code to the clinic, and staff send reminders from the clinic phone with one tap. **Paid**: codes and reminders are sent automatically with Meta templates. "Opened in WhatsApp" means staff opened the message, not that it was delivered.
- There is a single doctor and a single clinic, with the Africa/Cairo timezone.
- The UI is in Arabic (default) and English, with right-to-left layout and light/dark themes. Patient messages use each patient's language.

## Troubleshooting

- **`setup` can't connect:** use the Session pooler URI as `DATABASE_URL`, and check the password. URL-encode special characters, for example `@` becomes `%40`.
- **"Missing SUPABASE_SERVICE_ROLE_KEY":** add it to `.env.local`. Never rename it with a `NEXT_PUBLIC_` prefix.
- **Login works but pages are empty:** run `npm run setup` again. It reloads the API schema cache.

More detail is in `docs/database.md`, `docs/patient-portal.md` and `docs/whatsapp.md`.
