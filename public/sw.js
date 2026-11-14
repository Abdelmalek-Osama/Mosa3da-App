/*
 * Minimal service worker for installability (PWA).
 * Network only: clinic data is live, so nothing is cached. When the phone is
 * offline, page navigations get a small bilingual "no connection" page instead
 * of the browser's error screen.
 */
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لا يوجد اتصال</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff;color:#1b2b4b;text-align:center;padding:24px}button{margin-top:16px;padding:12px 20px;border:0;border-radius:12px;background:#1b2b4b;color:#fff;font-size:16px}</style></head><body><div><h1>لا يوجد اتصال بالإنترنت</h1><p>تحقّقي من الاتصال ثم حاولي مرة أخرى.</p><p dir="ltr">You're offline. Check your connection and try again.</p><button onclick="location.reload()">إعادة المحاولة / Retry</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
