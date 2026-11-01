import { bodyParams, sendTemplate, type CloudApiCredentials } from "./cloud-api";
import type { WhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./types";

/** Paid mode: reminders go out automatically as approved utility templates. */
export class CloudApiWhatsAppProvider implements WhatsAppProvider {
  readonly name = "cloud_api";
  readonly simulated = false;

  constructor(
    private readonly creds: CloudApiCredentials,
    private readonly templates: Record<string, string>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const template = this.templates[message.templateKey];
    if (!template) return { ok: false, error: `No template configured for ${message.templateKey}`, retryable: false };
    return sendTemplate(
      this.creds,
      { to: message.to, template, languageCode: message.locale, components: [bodyParams(message.params)] },
      this.fetchImpl,
    );
  }
}
