import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta signs every webhook POST: X-Hub-Signature-256: sha256=<hex HMAC of the raw body>. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface InboundText {
  from: string; // E.164
  body: string;
  id: string;
}

/** Extracts inbound text messages from a webhook payload. Ignores statuses and other types. */
export function parseInboundTexts(payload: unknown): InboundText[] {
  const out: InboundText[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages as { from?: string; id?: string; type?: string; text?: { body?: string } }[]) {
        if (m?.type !== "text" || typeof m.from !== "string" || typeof m.text?.body !== "string") continue;
        const from = m.from.replace(/\D/g, "");
        if (from.length < 8 || from.length > 15) continue;
        out.push({ from: `+${from}`, body: m.text.body, id: String(m.id ?? "") });
      }
    }
  }
  return out;
}

/**
 * Finds a 4-digit code in a message (the last standalone one, since the
 * prefilled text puts the code at the end). Accepts Arabic-Indic and Persian digits.
 */
export function extractCode(text: string): string | null {
  const latin = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const code = /(?<!\d)\d{4}(?!\d)/g;
  const matches = latin.match(code) ?? latin.replace(/[\s-]/g, "").match(code);
  return matches ? matches[matches.length - 1]! : null;
}
