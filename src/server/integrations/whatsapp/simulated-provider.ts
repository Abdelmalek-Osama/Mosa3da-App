import { logger } from "@/lib/logger";
import type { WhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types";

/**
 * Development simulator. Nothing leaves the server: the message is only stored in
 * notification_logs (channel = whatsapp_simulated) and shown in the admin UI.
 */
export class SimulatedWhatsAppProvider implements WhatsAppProvider {
  readonly name = "simulated";
  readonly simulated = true;

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    logger.info("whatsapp.simulated", {
      to: message.to.replace(/\d(?=\d{3})/g, "•"),
      template: message.templateKey,
      locale: message.locale,
      key: message.idempotencyKey,
    });
    return { ok: true, providerMessageId: `sim_${message.idempotencyKey}`, simulated: true };
  }
}
