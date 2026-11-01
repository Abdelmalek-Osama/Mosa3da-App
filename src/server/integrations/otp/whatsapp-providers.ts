import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import { otpComponents, sendTemplate, type CloudApiCredentials } from "../whatsapp/cloud-api";
import type { OtpDeliveryProvider, OtpDeliveryRequest, OtpDeliveryResult } from "./types";

/**
 * Free mode. The code is a pairing code: it only verifies the account when it
 * arrives at the clinic's webhook FROM the registered phone number, so showing
 * it on screen is safe. Typing it into the form is not accepted in this mode.
 */
export class InboundWhatsAppOtpProvider implements OtpDeliveryProvider {
  readonly name = "whatsapp_inbound";

  async deliver(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    logger.info("otp.inbound_issued", { phone: request.phone.replace(/\d(?=\d{3})/g, "•") });
    return { delivered: false, channel: "inbound", displayCode: request.code };
  }
}

/** Paid mode: sends the approved authentication template. */
export class CloudApiOtpProvider implements OtpDeliveryProvider {
  readonly name = "whatsapp_cloud_api";

  constructor(
    private readonly creds: CloudApiCredentials,
    private readonly template: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    const result = await sendTemplate(
      this.creds,
      { to: request.phone, template: this.template, languageCode: request.locale, components: otpComponents(request.code) },
      this.fetchImpl,
    );
    if (!result.ok) {
      throw new AppError("INTERNAL", "We couldn't send the WhatsApp code. Please try again in a moment.", {
        cause: result.error,
      });
    }
    return { delivered: true, channel: "whatsapp", providerMessageId: result.providerMessageId };
  }
}
