import "server-only";
import { CloudApiWhatsAppProvider } from "./cloud-api-provider";
import { whatsAppConfig } from "./config";
import { SimulatedWhatsAppProvider } from "./simulated-provider";
import type { WhatsAppProvider } from "./types";

export type { WhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types";
export { otpMode, reminderChannel, waMeLink, whatsAppConfig, type OtpMode, type ReminderChannel } from "./config";

/** Cloud API when WHATSAPP_AUTO_SEND=true and credentials exist; otherwise the simulator. */
export function getWhatsAppProvider(): WhatsAppProvider {
  const cfg = whatsAppConfig();
  if (cfg.autoSend && cfg.accessToken && cfg.phoneNumberId) {
    return new CloudApiWhatsAppProvider(
      { accessToken: cfg.accessToken, phoneNumberId: cfg.phoneNumberId, graphVersion: cfg.graphVersion },
      cfg.templates,
    );
  }
  return new SimulatedWhatsAppProvider();
}
