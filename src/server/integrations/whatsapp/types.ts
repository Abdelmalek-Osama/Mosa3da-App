export interface WhatsAppMessage {
  to: string; // E.164
  body: string;
  templateKey: string;
  /** Ordered values for the approved Meta template ({{1}}, {{2}} …). */
  params: string[];
  locale: "ar" | "en";
  idempotencyKey: string;
}

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string; simulated: boolean }
  | { ok: false; error: string; retryable: boolean };

/** Replaceable provider contract: simulated, or the WhatsApp Cloud API. */
export interface WhatsAppProvider {
  readonly name: string;
  readonly simulated: boolean;
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}
