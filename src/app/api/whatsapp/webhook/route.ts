import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { normalizePhone } from "@/lib/auth/patient-identity";
import { verifyInboundWhatsAppCode } from "@/server/application/patients/registration-service";
import { whatsAppConfig } from "@/server/integrations/whatsapp/config";
import { extractCode, parseInboundTexts, verifySignature } from "@/server/integrations/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Meta's one-time subscription handshake (Webhooks → Verify and save). */
export async function GET(request: NextRequest) {
  const { verifyToken } = whatsAppConfig();
  const params = request.nextUrl.searchParams;
  const token = params.get("hub.verify_token") ?? "";
  if (!verifyToken || params.get("hub.mode") !== "subscribe" || !safeEqual(token, verifyToken)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * Inbound messages. Receiving is free, and we never reply (replies are billed).
 * A 6-digit code from a number with a pending registration verifies that account.
 */
export async function POST(request: NextRequest) {
  const { appSecret } = whatsAppConfig();
  if (!appSecret) return new NextResponse("Not configured", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    logger.warn("whatsapp.webhook_bad_signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const message of parseInboundTexts(payload).slice(0, 20)) {
    const code = extractCode(message.body);
    if (!code) continue;
    const phone = normalizePhone(message.from) ?? message.from;
    try {
      const result = await verifyInboundWhatsAppCode(phone, code);
      logger.info("whatsapp.inbound_code", { result, phone: phone.replace(/\d(?=\d{3})/g, "•") });
    } catch (error) {
      // Still answer 200 so Meta doesn't retry a message we can't use.
      logger.error("whatsapp.inbound_failed", { error });
    }
  }
  return NextResponse.json({ ok: true });
}
