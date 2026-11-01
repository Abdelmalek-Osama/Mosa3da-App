import { logger } from "@/lib/logger";
import type { OtpDeliveryProvider, OtpDeliveryRequest, OtpDeliveryResult } from "./types";

/** Sends nothing. Returns the code so the demo UI can display it, labelled as a demo. */
export class DemoOtpProvider implements OtpDeliveryProvider {
  readonly name = "demo";

  async deliver(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    logger.info("otp.demo_issued", { phone: request.phone.replace(/\d(?=\d{3})/g, "•"), purpose: request.purpose });
    return { delivered: false, channel: "demo", demoCode: request.code };
  }
}
