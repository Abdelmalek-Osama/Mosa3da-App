# Dr. Rodaina Medhat Clinic — Pregnancy portal & waiting-room display

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/patient/register` | public | Name, mobile, optional email, password. Creates an inactive patient account and issues an OTP. |
| `/patient/verify` | signed-in, unverified | 4-digit code. On success the profile is activated and linked to an existing walk-in record with the same phone, if any. |
| `/patient/login` | public | Mobile + password. Unverified accounts are sent back to verify with a fresh code. |
| `/patient/dashboard` | patient | Live queue status for today (number, patients ahead, estimated wait, expected time), next appointment. |
| `/patient/book-appointment` | patient | Day → time → reason → confirm. |
| `/patient/my-appointments` | patient | Upcoming and past visits, online cancellation until the cutoff. |
| `/display` | public | Waiting-room TV. Reads `/api/display` every 5 s. |

## Mock OTP

- Codes come from `crypto.randomInt`, are stored only as `HMAC-SHA256(OTP_PEPPER, phone:purpose:code)`, expire after 10 minutes, allow 5 attempts and a resend every 30 s.
- `DemoOtpProvider` sends nothing. The plain code is kept in an httpOnly cookie scoped to `/patient/verify` and shown in a clearly labelled "Demo mode · not sent by WhatsApp" panel.
- The panel is shown when `NODE_ENV !== "production"` or `DEMO_OTP_DISPLAY=true`. Set it to `true` on Vercel for a demo; never in a real deployment. A real provider implements `OtpProvider` in `src/server/integrations/otp`.

## Booking rules (migration `20261031000200_booking.sql`)

- Slots = active working periods for the weekday, every `slot_interval_minutes`, each `default_consultation_minutes` long, at least 15 minutes in the future, inside `booking_horizon_days`.
- `book_appointment` re-validates the slot in the same transaction (MQ422 outside hours, MQ409 taken, MQ422 if the patient already has a visit that day). The appointments exclusion constraint is the final guard against two concurrent bookings.
- Same-day bookings appear on the staff queue as Scheduled. The queue number is given when reception checks the patient in.
- `cancel_my_appointment` only works on the caller's own scheduled appointment and before `cancellation_cutoff_minutes` (default 120).

## Display privacy

`get_display_board()` is the only function granted to `anon`. It returns queue numbers, masked names (`Salma H.`), expected times and a late flag. No phone, email, notes, visit reason or patient id.
