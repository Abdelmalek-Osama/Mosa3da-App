import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { otpComponents, sendTemplate } from "@/server/integrations/whatsapp/cloud-api";
import { CloudApiWhatsAppProvider } from "@/server/integrations/whatsapp/cloud-api-provider";
import { extractCode, parseInboundTexts, verifySignature } from "@/server/integrations/whatsapp/webhook";

const creds = { accessToken: "token-123", phoneNumberId: "1055", graphVersion: "v25.0" };
const ok = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("webhook signature", () => {
  const secret = "app-secret";
  const body = '{"entry":[]}';
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts Meta's HMAC of the raw body", () => expect(verifySignature(body, sig, secret)).toBe(true));
  it("rejects a tampered body, a wrong secret and a missing header", () => {
    expect(verifySignature(body + " ", sig, secret)).toBe(false);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=zz", secret)).toBe(false);
  });
});

describe("inbound message parsing", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "966501234567", id: "wamid.1", type: "text", text: { body: "رمز التحقق الخاص بي في عيادة د. رودينا مدحت: 1234" } },
                { from: "966501234567", id: "wamid.2", type: "image" },
              ],
              statuses: [{ id: "x", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };

  it("returns only text messages, with E.164 senders", () => {
    expect(parseInboundTexts(payload)).toEqual([
      { from: "+966501234567", id: "wamid.1", body: "رمز التحقق الخاص بي في عيادة د. رودينا مدحت: 1234" },
    ]);
    expect(parseInboundTexts({})).toEqual([]);
    expect(parseInboundTexts(null)).toEqual([]);
  });

  it("finds the code in Latin, Arabic-Indic and spaced digits", () => {
    expect(extractCode("My Dr. Rodaina Medhat Clinic verification code: 0042")).toBe("0042");
    expect(extractCode("رمزي ١٢٣٤")).toBe("1234");
    expect(extractCode("۹۸۷۶")).toBe("9876");
    expect(extractCode("12 34")).toBe("1234");
    expect(extractCode("Clinic 2026, my code: 5821")).toBe("5821");
    expect(extractCode("call me on 0501234567")).toBeNull();
    expect(extractCode("123456")).toBeNull();
    expect(extractCode("hello")).toBeNull();
  });
});

describe("Cloud API", () => {
  it("sends an authentication template with the code in body and button", async () => {
    const fetchImpl = ok({ messages: [{ id: "wamid.abc" }] });
    const res = await sendTemplate(
      creds,
      { to: "+966501234567", template: "mosa3da_otp", languageCode: "ar", components: otpComponents("1234") },
      fetchImpl as unknown as typeof fetch,
    );
    expect(res).toEqual({ ok: true, providerMessageId: "wamid.abc", simulated: false });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/1055/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    const sent = JSON.parse(String(init.body));
    expect(sent.to).toBe("966501234567");
    expect(sent.template).toMatchObject({ name: "mosa3da_otp", language: { code: "ar" } });
    expect(sent.template.components[1]).toMatchObject({ type: "button", sub_type: "url", parameters: [{ text: "1234" }] });
  });

  it("marks rate limits as retryable and bad requests as final", async () => {
    const limited = await sendTemplate(creds, { to: "+1", template: "t", languageCode: "en", components: [] },
      ok({ error: { message: "Rate limit", code: 130429 } }, 429) as unknown as typeof fetch);
    expect(limited).toEqual({ ok: false, error: "Rate limit", retryable: true });
    const bad = await sendTemplate(creds, { to: "+1", template: "t", languageCode: "en", components: [] },
      ok({ error: { message: "Template does not exist", code: 132001 } }, 400) as unknown as typeof fetch);
    expect(bad).toMatchObject({ ok: false, retryable: false });
  });

  it("reminder provider maps template keys and passes params in order", async () => {
    const fetchImpl = ok({ messages: [{ id: "wamid.r" }] });
    const provider = new CloudApiWhatsAppProvider(creds, { appointment_reminder: "mosa3da_appointment_reminder" }, fetchImpl as unknown as typeof fetch);
    const res = await provider.send({
      to: "+966501234567", body: "…", templateKey: "appointment_reminder", locale: "en",
      params: ["Sara", "Dr. Rodaina Medhat Clinic", "Sunday 01 Nov 2026", "10:20"], idempotencyKey: "appointment_reminder:x",
    });
    expect(res.ok).toBe(true);
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Sara", "Dr. Rodaina Medhat Clinic", "Sunday 01 Nov 2026", "10:20"]);
    const missing = await provider.send({ to: "+1", body: "", templateKey: "consultation_approaching", locale: "ar", params: [], idempotencyKey: "k" });
    expect(missing).toMatchObject({ ok: false, retryable: false });
  });
});
