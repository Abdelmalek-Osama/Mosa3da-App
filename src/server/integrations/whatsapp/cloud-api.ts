import { logger } from "@/lib/logger";
import type { WhatsAppSendResult } from "./types";

export interface CloudApiCredentials {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
}

type TemplateComponent =
  | { type: "body"; parameters: { type: "text"; text: string }[] }
  | { type: "button"; sub_type: "url"; index: string; parameters: { type: "text"; text: string }[] };

/** Sends one template message through the WhatsApp Cloud API (graph.facebook.com). */
export async function sendTemplate(
  creds: CloudApiCredentials,
  input: { to: string; template: string; languageCode: string; components: TemplateComponent[] },
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/${creds.graphVersion}/${encodeURIComponent(creds.phoneNumberId)}/messages`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to.replace(/\D/g, ""),
        type: "template",
        template: { name: input.template, language: { code: input.languageCode }, components: input.components },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn("whatsapp.cloud_network_error", { error });
    return { ok: false, error: "WhatsApp could not be reached", retryable: true };
  }

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string; code?: number };
  };
  const id = json.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, providerMessageId: id, simulated: false };

  const message = json.error?.message ?? `HTTP ${res.status}`;
  logger.warn("whatsapp.cloud_rejected", { status: res.status, code: json.error?.code, message });
  return { ok: false, error: message.slice(0, 500), retryable: res.status === 429 || res.status >= 500 };
}

export const bodyParams = (values: string[]): TemplateComponent => ({
  type: "body",
  parameters: values.map((text) => ({ type: "text", text })),
});

/** Authentication templates repeat the code in the copy-code / URL button. */
export const otpComponents = (code: string): TemplateComponent[] => [
  bodyParams([code]),
  { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
];
