import "server-only";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * "Last seen" log for the lobby TV, without a database migration: one tiny
 * JSON object per minute in a private Supabase Storage bucket
 * (display-heartbeats/YYYY-MM-DD/HH-MM.json, UTC), written when the TV
 * loads the board or fetches an update. Minutes with no object = the TV did
 * not reach the server. Read with GET /admin/display-health (doctor only).
 */
export const HEARTBEAT_BUCKET = "display-heartbeats";

export type HeartbeatVia = "page" | "x" | "s";

let lastKey = "";
let bucketReady = false;

/** "Chrome 47 · SRAF" style label; never the full user-agent. */
export function uaFamily(ua: string): string {
  const engine = /(?:Chrome|Chromium)\/(\d+)/.exec(ua)?.[0]?.replace("/", " ") ?? /Firefox\/\d+|Version\/\d+|Presto|NetFront/.exec(ua)?.[0] ?? "unknown";
  const tv = /SRAF|Web0S|webOS|Tizen|VIDAA|HbbTV|TOSHIBA|SmartTV|SMART-TV|NetCast/i.exec(ua)?.[0];
  return tv ? `${engine} · ${tv}` : engine;
}

function keyFor(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)}/${iso.slice(11, 13)}-${iso.slice(14, 16)}.json`;
}

async function write(via: HeartbeatVia, ua: string): Promise<void> {
  const now = new Date();
  const key = keyFor(now);
  if (key === lastKey) return; // at most one write per minute per server instance
  lastKey = key;
  try {
    const admin = createSupabaseAdminClient();
    if (!bucketReady) {
      // Private bucket, created on first use (no migration); "already exists" is fine.
      await admin.storage.createBucket(HEARTBEAT_BUCKET, { public: false }).catch(() => undefined);
      bucketReady = true;
    }
    const { error } = await admin.storage
      .from(HEARTBEAT_BUCKET)
      .upload(key, JSON.stringify({ at: now.toISOString(), via, ua: uaFamily(ua) }), { upsert: true, contentType: "application/json" });
    if (error) {
      lastKey = "";
      logger.warn("display.heartbeat_failed", { message: error.message });
    }
  } catch (error) {
    lastKey = "";
    logger.warn("display.heartbeat_failed", { error });
  }
}

/** Records a TV check-in; never makes the screen wait more than `maxWaitMs`. */
export async function recordTvHeartbeat(via: HeartbeatVia, ua: string, maxWaitMs = 800): Promise<void> {
  if (process.env.DISPLAY_HEARTBEATS === "off") return; // local testing against a shared database
  await Promise.race([write(via, ua), new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))]);
}

export interface HeartbeatReport {
  /** Clinic date (YYYY-MM-DD, clinic timezone). */
  date: string;
  timezone: string;
  minutesSeen: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Periods of 3+ minutes with no check-in between the first and last one, clinic time. */
  gaps: { from: string; to: string; minutes: number }[];
  via: Record<string, number>;
  browsers: string[];
}

/** Builds the day's report from the stored minutes (service role; call only after a doctor check). */
export async function readHeartbeats(date: string, timeZone: string): Promise<HeartbeatReport> {
  const admin = createSupabaseAdminClient();
  // A clinic day spans two UTC dates; read both and keep the clinic date.
  const day = new Date(`${date}T00:00:00Z`);
  const prev = new Date(day.getTime() - 86_400_000).toISOString().slice(0, 10);
  const next = new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10);
  const local = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

  const minutes: Date[] = [];
  for (const folder of [prev, date, next]) {
    const { data } = await admin.storage.from(HEARTBEAT_BUCKET).list(folder, { limit: 2000 });
    for (const o of data ?? []) {
      const m = /^(\d{2})-(\d{2})\.json$/.exec(o.name);
      if (!m) continue;
      const at = new Date(`${folder}T${m[1]}:${m[2]}:00Z`);
      if (local(at) === date) minutes.push(at);
    }
  }
  minutes.sort((a, b) => a.getTime() - b.getTime());

  const gaps: HeartbeatReport["gaps"] = [];
  for (let i = 1; i < minutes.length; i++) {
    const missing = Math.round((minutes[i]!.getTime() - minutes[i - 1]!.getTime()) / 60_000) - 1;
    if (missing >= 3) gaps.push({ from: hhmm(new Date(minutes[i - 1]!.getTime() + 60_000)), to: hhmm(minutes[i]!), minutes: missing });
  }

  // Method and browser of a sample of minutes (the latest 30), to see which transport works.
  const via: Record<string, number> = {};
  const browsers = new Set<string>();
  for (const at of minutes.slice(-30)) {
    const iso = at.toISOString();
    const { data } = await admin.storage.from(HEARTBEAT_BUCKET).download(`${iso.slice(0, 10)}/${iso.slice(11, 13)}-${iso.slice(14, 16)}.json`);
    if (!data) continue;
    try {
      const j = JSON.parse(await data.text()) as { via?: string; ua?: string };
      if (j.via) via[j.via] = (via[j.via] ?? 0) + 1;
      if (j.ua) browsers.add(j.ua);
    } catch {
      /* ignore a bad object */
    }
  }

  return {
    date,
    timezone: timeZone,
    minutesSeen: minutes.length,
    firstSeen: minutes[0] ? hhmm(minutes[0]) : null,
    lastSeen: minutes.length ? hhmm(minutes[minutes.length - 1]!) : null,
    gaps,
    via,
    browsers: [...browsers],
  };
}
