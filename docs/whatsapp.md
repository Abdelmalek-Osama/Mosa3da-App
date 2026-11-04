# WhatsApp: verification codes and reminders

The app picks a mode from the env vars. You don't need to change any code.

| Mode | When | Code check | Reminders | Cost |
| --- | --- | --- | --- | --- |
| **Demo** | No `WHATSAPP_*` vars set | The code is shown on screen, labelled "not sent" | Staff tap **Send**, and WhatsApp opens on their phone with the message ready | Free |
| **Free** | `WHATSAPP_CLINIC_NUMBER`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` are set | The patient taps **Send the code on WhatsApp** and sends it to the clinic number. The page continues by itself. | Same as demo: one tap by staff | Free. Messages patients send to the clinic cost nothing, and the app never replies. |
| **Paid** | `WHATSAPP_AUTO_SEND=true` plus `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` | The code is sent to the patient by WhatsApp, and she types it in | Sent automatically: tomorrow's appointments (daily cron), turn alerts (when the queue changes) and the **WhatsApp reminder** button | Meta bills each message it delivers |

## How the free code check stays secure

The code on screen is a *pairing code*. It verifies the account only when it reaches `/api/whatsapp/webhook` **from the phone number that registered**. Typing the code into the form is refused in this mode, so seeing the code on screen proves nothing. Each webhook call is checked against `X-Hub-Signature-256` using your App Secret. Codes are stored only as HMAC hashes, expire after 10 minutes, and can be used once.

"Opened in WhatsApp" on the dashboard means a staff member opened the prepared message. It does not mean the message was sent or delivered.

## Free mode setup (about 20 minutes)

You need a public HTTPS URL for the app, such as a Vercel deploy. For local testing you can use `ngrok http 3000`.

1. Go to <https://developers.facebook.com/apps>, click **Create app**, choose **Other** and then **Business**, and add the **WhatsApp** product.
2. Under **WhatsApp → API Setup**, use the free test number, or add the clinic's number. Put that number in `WHATSAPP_CLINIC_NUMBER` with the country code and digits only, for example `966501234567`.
3. Copy **App settings → Basic → App secret** into `WHATSAPP_APP_SECRET`.
4. Choose any long random string for `WHATSAPP_VERIFY_TOKEN`.
5. Under **WhatsApp → Configuration → Webhook**, click **Edit**:
   - Callback URL: `https://<your-app>/api/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`

   Click **Verify and save**, then **Manage** and subscribe to the **messages** field.
6. Restart the app. Register a patient. The verify page now shows the WhatsApp button.

With the test number, Meta only accepts messages from up to 5 phone numbers that you add under **API Setup → To**. Add the clinic's own number for production.

## Switching on paid automatic sending

1. Under **API Setup**, create a permanent token: **Business settings → System users → Generate token**, with the `whatsapp_business_messaging` permission. Put it in `WHATSAPP_ACCESS_TOKEN`. Put the **Phone number ID** in `WHATSAPP_PHONE_NUMBER_ID`.
2. Create these templates in **WhatsApp Manager → Message templates**, in both **Arabic (ar)** and **English (en)**, and wait for Meta to approve them.
3. Set `WHATSAPP_AUTO_SEND=true` and restart. Don't change `WHATSAPP_GRAPH_VERSION` (default `v25.0`) unless Meta retires it.

### `mosa3da_otp` (category: Authentication)

Meta writes the text for you. Choose **Copy code**, which gives "*{{1}}* is your verification code."

### `mosa3da_appointment_reminder` (category: Utility)

- **ar:** مرحبًا {{1}}، نذكّركِ بموعد كشفكِ في {{2}} {{3}} الساعة {{4}}. نرجو التواجد في العيادة لتأكيد دوركِ. إذا تعذّر عليكِ الحضور، يُرجى إلغاء الموعد من حسابكِ أو إخبار السكرتيرة لإتاحة الفرصة لحالة أخرى.
- **en:** Hello {{1}}, a reminder of your appointment at {{2}} {{3}} at {{4}}. Please be at the clinic to confirm your turn. If you can't make it, please cancel it from your account or tell the secretary so another visitor can take the slot.

The variables are: {{1}} first name, {{2}} clinic name, {{3}} "اليوم" / "today" for same-day reminders, otherwise "يوم الثلاثاء 03/11" / "on Tuesday 03 Nov", {{4}} 12-hour time ("04:10 مساءً" / "4:10 PM").

### `mosa3da_turn_approaching` (category: Utility)

- **ar:** مرحبًا {{1}}، اقترب موعد دخولكِ. الوقت المتوقع لدخولكِ {{2}}. يُرجى التوجّه إلى العيادة.
- **en:** Hello {{1}}, your consultation is approaching. Your expected consultation time is {{2}}. Please proceed to the clinic.

The variables are: {{1}} first name, {{2}} time.

### `mosa3da_appointment_soon` (category: Utility)

- **ar:** أهلاً بحضرتك يا فندم، متبقي 30 دقيقة على موعد كشفك في {{1}}. نرجو التواجد للعيادة. {{2}}
- **en:** Hello, your appointment at {{1}} is in 30 minutes. Please make your way to the clinic. {{2}}

The variables are: {{1}} clinic name, {{2}} the clinic's map link from Clinic settings (may be empty).

You can rename any template with `WHATSAPP_TEMPLATE_OTP`, `WHATSAPP_TEMPLATE_APPOINTMENT`, `WHATSAPP_TEMPLATE_TURN` or `WHATSAPP_TEMPLATE_SOON`.

## Who gets what

- **Appointment reminders** go to patients who have a portal account. The cron at `/api/cron/notifications` prepares them for tomorrow's scheduled bookings. Staff can send one for any scheduled booking from **Appointments**.
- **30-minute alerts** go to every visitor with a booking today that starts within 30 minutes while she has not checked in yet.
- **Turn alerts** go to everyone in today's queue when their expected time falls within the reminder window set in Clinic settings.
- Every message uses the patient's language. That is the language she used when she registered, or her latest choice in the language switcher. Staff can change it in the patient form.
- Each message is created once per appointment or queue entry, so a cron that runs twice never sends a message twice.

## How often alerts are checked

Turn alerts and 30-minute alerts depend on the clock. Vercel's Hobby plan runs the cron only once a day, so the app also checks every time staff act on the queue and, at most once a minute, whenever the waiting-room screen refreshes (it polls every 5 seconds while it is open). For alerts without the TV open, point any external scheduler (for example cron-job.org, every 5 minutes) at `GET /api/cron/notifications` with the header `Authorization: Bearer <CRON_SECRET>`. Every run is idempotent.
