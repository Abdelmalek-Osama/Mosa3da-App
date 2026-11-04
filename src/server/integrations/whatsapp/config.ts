import "server-only";

export type OtpMode = "demo" | "inbound" | "cloud_api";
export type ReminderChannel = "whatsapp" | "whatsapp_link";

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * All WhatsApp settings come from server env. Nothing here is sent to the
 * browser except the clinic's public WhatsApp number.
 *
 *   free (default) : patients send their code to the clinic number; staff send
 *                    reminders themselves with a one-tap wa.me link.
 *   paid           : WHATSAPP_AUTO_SEND=true + Cloud API credentials. Codes and
 *                    reminders are sent automatically with approved templates.
 */
export function whatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || undefined;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || undefined;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || undefined;
  const clinicNumber = digits(process.env.WHATSAPP_CLINIC_NUMBER) || undefined;
  const cloudReady = !!(accessToken && phoneNumberId);

  return {
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    clinicNumber,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0",
    autoSend: process.env.WHATSAPP_AUTO_SEND === "true" && cloudReady,
    /** Free inbound code check needs the clinic number and a verified webhook. */
    inboundReady: !!(clinicNumber && appSecret && verifyToken),
    templates: {
      otp: process.env.WHATSAPP_TEMPLATE_OTP?.trim() || "mosa3da_otp",
      appointment_reminder: process.env.WHATSAPP_TEMPLATE_APPOINTMENT?.trim() || "mosa3da_appointment_reminder",
      consultation_approaching: process.env.WHATSAPP_TEMPLATE_TURN?.trim() || "mosa3da_turn_approaching",
      appointment_soon: process.env.WHATSAPP_TEMPLATE_SOON?.trim() || "mosa3da_appointment_soon",
    } as Record<string, string>,
  };
}

export function otpMode(): OtpMode {
  const cfg = whatsAppConfig();
  if (cfg.autoSend) return "cloud_api";
  if (cfg.inboundReady) return "inbound";
  return "demo";
}

export function reminderChannel(): ReminderChannel {
  return whatsAppConfig().autoSend ? "whatsapp" : "whatsapp_link";
}

/** wa.me deep link. `to` is E.164 or digits. */
export function waMeLink(to: string, text: string): string {
  return `https://wa.me/${digits(to)}?text=${encodeURIComponent(text)}`;
}
