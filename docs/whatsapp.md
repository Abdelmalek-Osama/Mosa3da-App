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

- **ar:** مرحبًا {{1}}، نذكّركِ بموعدكِ في {{2}} يوم {{3}} الساعة {{4}}. إذا تعذّر عليكِ الحضور، يُرجى إلغاء الموعد من حسابكِ.
- **en:** Hello {{1}}, this is a reminder of your appointment at {{2}} on {{3}} at {{4}}. If you can't make it, please cancel it from your patient account.

The variables are: {{1}} first name, {{2}} clinic name, {{3}} day and date, {{4}} time.

### `mosa3da_turn_approaching` (category: Utility)

- **ar:** مرحبًا {{1}}، اقترب موعد دخولكِ. الوقت المتوقع لدخولكِ {{2}}. يُرجى التوجّه إلى العيادة.
- **en:** Hello {{1}}, your consultation is approaching. Your expected consultation time is {{2}}. Please proceed to the clinic.

The variables are: {{1}} first name, {{2}} time.

You can rename any template with `WHATSAPP_TEMPLATE_OTP`, `WHATSAPP_TEMPLATE_APPOINTMENT` or `WHATSAPP_TEMPLATE_TURN`.

## Who gets what

- **Appointment reminders** go to patients who have a portal account. The cron at `/api/cron/notifications` prepares them for tomorrow's scheduled bookings. Staff can send one for any scheduled booking from **Appointments**.
- **Turn alerts** go to everyone in today's queue when their expected time falls within the reminder window set in Clinic settings.
- Every message uses the patient's language. That is the language she used when she registered, or her latest choice in the language switcher. Staff can change it in the patient form.
- Each message is created once per appointment or queue entry, so a cron that runs twice never sends a message twice.
