import "server-only";
import { otpMode, whatsAppConfig } from "../whatsapp/config";
import { DemoOtpProvider } from "./demo-provider";
import { CloudApiOtpProvider, InboundWhatsAppOtpProvider } from "./whatsapp-providers";
import type { OtpDeliveryProvider } from "./types";

export type { OtpDeliveryProvider, OtpDeliveryRequest, OtpDeliveryResult } from "./types";

/** demo (nothing configured) → inbound (free, patient sends the code) → cloud_api (paid). */
export function getOtpProvider(): OtpDeliveryProvider {
  const mode = otpMode();
  if (mode === "cloud_api") {
    const cfg = whatsAppConfig();
    return new CloudApiOtpProvider(
      { accessToken: cfg.accessToken!, phoneNumberId: cfg.phoneNumberId!, graphVersion: cfg.graphVersion },
      cfg.templates.otp!,
    );
  }
  if (mode === "inbound") return new InboundWhatsAppOtpProvider();
  return new DemoOtpProvider();
}

/** Demo codes are shown only when explicitly enabled (always on outside production). */
export function isDemoOtpDisplayEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_OTP_DISPLAY === "true";
}
