export interface OtpDeliveryRequest {
  phone: string; // E.164
  code: string;
  expiresAt: Date;
  purpose: "patient_registration" | "password_reset";
  locale: "ar" | "en";
}

export type OtpDeliveryResult =
  /** Paid mode: sent by WhatsApp with the authentication template. */
  | { delivered: true; channel: "whatsapp"; providerMessageId: string }
  /** Free mode: nothing is sent. The patient sends this code to the clinic number from her own WhatsApp. */
  | { delivered: false; channel: "inbound"; displayCode: string }
  /** Demo mode: nothing was sent; the code may be shown in a clearly marked demo panel. */
  | { delivered: false; channel: "demo"; demoCode: string };

export interface OtpDeliveryProvider {
  readonly name: string;
  deliver(request: OtpDeliveryRequest): Promise<OtpDeliveryResult>;
}
