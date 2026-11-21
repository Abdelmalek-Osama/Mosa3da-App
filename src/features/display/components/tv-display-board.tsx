import type { DisplayBoard } from "@/features/queue/schemas";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { TEXT, clock, longDate, remaining } from "@/features/display/display-text";

/** Seconds between background updates of the TV board. */
export const TV_UPDATE_SECONDS = 15;
/** Clean full reload (only when the server is reachable) to keep TV browser memory low. */
export const TV_RELOAD_MINUTES = 50;
/** Without JavaScript the page can only reload itself; slower, to limit risk on a flaky network. */
const TV_NOSCRIPT_REFRESH_SECONDS = 60;
const PER_COLUMN = 8;

/**
 * Lobby board for smart-TV and other old browsers. Only CSS that old engines
 * understand (no grid, no CSS variables, no clamp()/min(), no space-separated
 * rgb(), no flex gap) and a tiny ES5 script:
 *   - loads once, then every TV_UPDATE_SECONDS fetches the new board HTML from
 *     /api/display/tv and swaps it in (only when it changed);
 *   - if the network or server fails, the last board stays on screen with a
 *     small "Reconnecting" note: never a browser error page;
 *   - every TV_RELOAD_MINUTES it does a clean reload, but only right after a
 *     successful update (server reachable), to free the TV browser's memory;
 *   - asks the browser to keep the screen awake where supported.
 * Modern browsers get the live board (DisplayBoardView); see src/app/display/page.tsx.
 */
export function TvDisplayBoard({ board, now }: { board: DisplayBoard | null; now: number }) {
  return (
    <div className="tv-root" dir="rtl" lang="ar">
      <style dangerouslySetInnerHTML={{ __html: TV_CSS }} />
      <noscript>
        <meta httpEquiv="refresh" content={String(TV_NOSCRIPT_REFRESH_SECONDS)} />
      </noscript>
      <div id="tv-content" className="tv-content" dangerouslySetInnerHTML={{ __html: renderTvBoardHtml(board, now) }} />
      <div id="tv-offline" className="tv-offline">
        {TEXT.ar.reconnecting}
        <span id="tv-offline-why" className="tv-offline-why" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: TV_SCRIPT }} />
    </div>
  );
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Everything that changes (clock, cards, list) as plain HTML: used for the
 * first render and served by /api/display/tv for the in-place updates. Every
 * value is escaped.
 */
export function renderTvBoardHtml(board: DisplayBoard | null, now: number): string {
  const tz = board?.clinic.timezone ?? DEFAULT_TIMEZONE;
  const bilingual = board?.clinic.bilingual ?? false;
  const t = TEXT.ar;
  const empty = !board || (!board.session_open && !board.current && board.waiting.length === 0 && (board.booked?.length ?? 0) === 0);

  type Row = { number: string; name: string; nameEn: string | null; at: string | null; lobby: boolean; late: boolean; shifted: boolean; delayed: boolean; slot: string | null };
  const rows: Row[] = board
    ? [
        ...board.waiting.map((w) => ({
          number: w.queue_number != null ? String(w.queue_number) : "—",
          name: w.name_ar ?? w.display_name ?? "",
          nameEn: bilingual ? (w.name_en ?? null) : null,
          at: w.expected_start_at,
          lobby: true,
          late: w.is_late,
          shifted: false,
          delayed: false,
          slot: null,
        })),
        ...(board.booked ?? []).map((b) => ({
          number: "·",
          name: b.name_ar,
          nameEn: bilingual ? b.name_en : null,
          at: b.slot_start,
          lobby: false,
          late: false,
          shifted: b.grace_shifts > 0 && !b.is_delayed,
          delayed: b.is_delayed,
          slot: `${clock(b.slot_start, tz, "ar")}${b.slot_end ? ` - ${clock(b.slot_end, tz, "ar")}` : ""}`,
        })),
      ].sort((a, b) => (a.at ?? "9999").localeCompare(b.at ?? "9999"))
    : [];
  const twoCols = rows.length > 6;
  const shown = rows.slice(0, twoCols ? PER_COLUMN * 2 : 6);
  const hidden = rows.length - shown.length;

  const timing = (at: string | null, withEta: boolean) => {
    if (!at) return "";
    const minutes = Math.ceil((new Date(at).getTime() - now) / 60_000);
    return (
      `<div class="tv-timing"><div class="tv-left">${esc(minutes <= 0 ? t.anyMinute : `${t.left} ${remaining(minutes, "ar")}`)}</div>` +
      (withEta ? `<div class="tv-eta">${esc(`${t.eta} ${clock(at, tz, "ar")}`)}</div>` : "") +
      `</div>`
    );
  };
  const nameOf = (p: { name_ar?: string; display_name?: string }) => p.name_ar ?? p.display_name ?? "";

  let html =
    `<div class="tv-header"><div class="tv-brand"><div class="tv-clinic">${esc(board?.clinic.name_ar ?? "عيادة د. رودينا مدحت")}</div>` +
    (bilingual ? `<div class="tv-clinic-en" dir="ltr">${esc(board?.clinic.name ?? "")}</div>` : "") +
    `</div><div class="tv-clock"><div class="tv-time">${esc(clock(now, tz, "ar"))}</div><div class="tv-date">${esc(longDate(now, tz, "ar"))}</div></div></div>`;

  if (empty) {
    html +=
      `<div class="tv-closed"><div class="tv-closed-title">${esc(t.closed)}</div>` +
      (bilingual ? `<div class="tv-closed-en" dir="ltr">${esc(TEXT.en.closed)}</div>` : "") +
      `<div class="tv-closed-body">${esc(t.closedBody)}</div></div>`;
  } else {
    const b = board!;
    html += `<div class="tv-main"><div class="tv-cards">`;
    html += b.current
      ? `<div class="tv-card tv-now"><div class="tv-card-label">${esc(t.now)}</div><div class="tv-card-body"><div class="tv-big">${esc(b.current.queue_number ?? "—")}</div>` +
        `<div class="tv-card-info"><div class="tv-card-name">${esc(nameOf(b.current))}</div><div class="tv-card-sub">${esc(t.comeIn)}</div></div></div></div>`
      : `<div class="tv-card tv-idle"><div class="tv-idle-text">${esc(t.idle)}</div></div>`;
    if (b.next) {
      html +=
        `<div class="tv-card tv-next"><div class="tv-card-label tv-amber">${esc(t.next)}</div><div class="tv-card-body">` +
        `<div class="tv-big tv-big-next tv-amber">${esc(b.next.queue_number ?? "—")}</div>` +
        `<div class="tv-card-info"><div class="tv-card-name tv-next-name">${esc(nameOf(b.next))}</div>${timing(b.next.expected_start_at, true)}</div></div></div>`;
    }
    html += `</div><div class="tv-list"><div class="tv-list-head"><span class="tv-list-title">${esc(t.waiting)}</span><span class="tv-count">${rows.length}</span></div>`;
    if (shown.length === 0) {
      html += `<div class="tv-nobody">${esc(t.nobody)}</div>`;
    } else {
      html += `<div class="${twoCols ? "tv-rows tv-two" : "tv-rows"}">`;
      for (const r of shown) {
        const badges =
          (r.lobby ? `<span class="tv-badge tv-b-green">${esc(t.inLobby)}</span>` : `<span class="tv-badge tv-b-blue">${esc(t.notArrived)}</span>`) +
          (r.delayed ? `<span class="tv-badge tv-b-red">${esc(t.delayed)}</span>` : "") +
          (r.shifted ? `<span class="tv-badge tv-b-amber">${esc(t.shifted)}</span>` : "") +
          (r.late ? `<span class="tv-badge tv-b-red">${esc(t.late)}</span>` : "") +
          (r.slot ? `<span class="tv-slot">${esc(`${t.slot} ${r.slot}`)}</span>` : "");
        html +=
          `<div class="tv-row-wrap"><div class="tv-row"><div class="tv-num">${esc(r.number)}</div>` +
          `<div class="tv-info"><div class="tv-name">${esc(r.name)}</div>` +
          (r.nameEn ? `<div class="tv-name-en" dir="ltr">${esc(r.nameEn)}</div>` : "") +
          `<div class="tv-badges">${badges}</div></div>${timing(r.at, r.lobby)}</div></div>`;
      }
      html += `</div>`;
    }
    if (hidden > 0) html += `<div class="tv-more">+${hidden} ${esc(t.more)}</div>`;
    html += `</div></div>`;
  }

  html += `<div class="tv-footer"><span>${esc(t.estimates)}</span><span>${esc(t.checkIn)}</span></div>`;
  return html;
}

/*
 * Old-engine-safe CSS. Base size from the screen: width-based on 16:9 and
 * narrower, height-based on wider screens. Every other size is in em.
 */
const TV_CSS = `
html,body{margin:0;padding:0;background:#111c33;}
.tv-root{position:fixed;top:0;right:0;bottom:0;left:0;overflow:hidden;background:#111c33;color:#ffffff;
  font-family:Tahoma,Arial,sans-serif;font-family:var(--font-arabic),Tahoma,Arial,sans-serif;
  font-size:1.15vw;line-height:1.3;
  display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;}
@media (min-aspect-ratio: 16/9){.tv-root{font-size:2.05vh;}}
.tv-root *{box-sizing:border-box;}
.tv-content{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;
  display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;}
.tv-offline-why{font-weight:normal;font-size:0.8em;opacity:0.8;}
.tv-offline{display:none;position:absolute;top:0;left:50%;width:30em;margin-left:-15em;z-index:5;text-align:center;
  background:#f59e0b;color:#111c33;font-weight:bold;font-size:0.95em;padding:0.25em 0.8em;border-radius:0 0 0.7em 0.7em;}
.tv-header{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;-webkit-box-align:center;-webkit-align-items:center;align-items:center;
  padding:0.5em 1.6em;border-bottom:1px solid rgba(255,255,255,0.1);-webkit-flex-shrink:0;flex-shrink:0;}
.tv-clinic{font-size:1.6em;font-weight:bold;}
.tv-clinic-en{font-size:1.05em;color:#55d8cb;text-align:left;}
.tv-clock{text-align:left;}
.tv-time{font-size:2em;font-weight:bold;white-space:nowrap;}
.tv-date{font-size:0.95em;color:#c4d4ec;}
.tv-main{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-height:0;overflow:hidden;padding:1em 1.6em;
  display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;-webkit-flex-direction:column;flex-direction:column;}
.tv-cards{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-shrink:0;flex-shrink:0;margin-bottom:0.9em;}
.tv-card{border-radius:1.2em;padding:1em 1.3em;-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-width:0;}
.tv-now{background:#11a399;background:-webkit-linear-gradient(-45deg,#11a399,#0d6965);background:linear-gradient(135deg,#11a399,#0d6965);-webkit-box-flex:1.3;-webkit-flex-grow:1.3;flex-grow:1.3;}
.tv-idle{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);-webkit-box-flex:1.3;-webkit-flex-grow:1.3;flex-grow:1.3;}
.tv-idle-text{font-size:1.5em;color:#dfe8f5;}
.tv-next{background:rgba(255,255,255,0.07);border:1px solid rgba(252,211,77,0.35);margin-right:0.9em;}
.tv-card-label{font-size:1.2em;font-weight:bold;color:#c8f5ef;margin-bottom:0.4em;}
.tv-amber{color:#fcd34d;}
.tv-card-body{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;}
.tv-big{font-size:4.4em;font-weight:bold;line-height:0.9;margin-left:0.2em;}
.tv-big-next{font-size:3.2em;}
.tv-card-info{min-width:0;-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;}
.tv-card-name{font-size:1.9em;font-weight:bold;line-height:1.2;}
.tv-next-name{font-size:1.5em;}
.tv-card-sub{font-size:1.3em;color:#c8f5ef;margin-top:0.2em;}
.tv-list{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-height:0;overflow:hidden;border-radius:1.2em;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);padding:0.9em 1.2em;}
.tv-list-head{overflow:hidden;margin-bottom:0.6em;}
.tv-list-title{float:right;font-size:1.2em;font-weight:bold;color:#dfe8f5;}
.tv-count{float:left;font-size:1.1em;color:#c4d4ec;}
.tv-nobody{font-size:1.3em;color:#9ab6de;text-align:center;padding:2em 0;}
.tv-rows{}
.tv-two{-webkit-column-count:2;-moz-column-count:2;column-count:2;-webkit-column-gap:1em;-moz-column-gap:1em;column-gap:1em;}
.tv-row-wrap{display:inline-block;width:100%;padding-bottom:0.4em;-webkit-column-break-inside:avoid;page-break-inside:avoid;break-inside:avoid;}
.tv-row{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;background:rgba(255,255,255,0.06);border-radius:0.7em;padding:0.45em 0.9em;}
.tv-num{width:2.4em;-webkit-flex-shrink:0;flex-shrink:0;font-size:1.6em;font-weight:bold;line-height:1;}
.tv-info{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;min-width:0;padding-left:0.6em;}
.tv-name{font-size:1.25em;font-weight:bold;line-height:1.25;}
.tv-name-en{font-size:0.95em;color:#c4d4ec;text-align:right;}
.tv-badges{font-size:0.9em;margin-top:0.2em;}
.tv-badge{display:inline-block;border-radius:1em;padding:0.05em 0.7em;font-weight:bold;margin-left:0.4em;margin-bottom:0.15em;}
.tv-b-green{background:rgba(16,185,129,0.22);color:#a7f3d0;border:1px solid rgba(52,211,153,0.45);}
.tv-b-blue{background:rgba(14,165,233,0.18);color:#bae6fd;border:1px solid rgba(56,189,248,0.35);}
.tv-b-amber{background:rgba(245,158,11,0.22);color:#fde68a;border:1px solid rgba(251,191,36,0.45);}
.tv-b-red{background:rgba(239,68,68,0.22);color:#fecaca;border:1px solid rgba(248,113,113,0.45);}
.tv-slot{color:#c4d4ec;white-space:nowrap;}
.tv-timing{-webkit-flex-shrink:0;flex-shrink:0;text-align:left;}
.tv-left{font-size:1.1em;font-weight:bold;color:#fde68a;white-space:nowrap;}
.tv-eta{font-size:0.9em;color:#c4d4ec;white-space:nowrap;}
.tv-more{text-align:center;color:#9ab6de;margin-top:0.4em;}
.tv-closed{-webkit-box-flex:1;-webkit-flex:1 1 0;flex:1 1 0;text-align:center;padding-top:20vh;}
.tv-closed-title{font-size:3em;font-weight:bold;}
.tv-closed-en{font-size:2.2em;color:#55d8cb;margin-top:0.3em;}
.tv-closed-body{font-size:1.3em;color:#c4d4ec;margin-top:1em;}
.tv-footer{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;justify-content:space-between;
  padding:0.45em 1.6em;border-top:1px solid rgba(255,255,255,0.1);font-size:0.9em;color:#c4d4ec;-webkit-flex-shrink:0;flex-shrink:0;}
`;

/*
 * ES5 only (old TV engines): no arrow functions, const/let, fetch or promises
 * (except behind a feature check). Defensive: every step is wrapped so one
 * failure never blanks the screen.
 */
const TV_SCRIPT = `(function(){
  var UPDATE_MS=${TV_UPDATE_SECONDS * 1000}, RELOAD_MS=${TV_RELOAD_MINUTES * 60 * 1000};
  var started=new Date().getTime(), fails=0, busy=false, last='', seq=0;
  /* Short Wi-Fi blips are retried silently; the note shows only after this long without a successful update. */
  var OFFLINE_AFTER_MS=120000, lastOk=started;
  /* Self-heal: after this long without an update, fetch the board page itself. Only if it comes back
     complete (200 and the TV board inside, not an error or firewall challenge page) is the page reloaded,
     so the TV never reloads into a blank or error screen. */
  var HEAL_AFTER_MS=180000, probing=false;
  function heal(){
    if(probing) return; probing=true;
    var p, ended=false;
    function end(ok){ if(ended) return; ended=true; probing=false; if(ok){ try{ window.location.reload(); }catch(e){} } }
    try{
      p=new XMLHttpRequest();
      p.open('GET','/display?probe='+new Date().getTime(),true);
      p.onreadystatechange=function(){ if(p.readyState===4){ end(p.status===200 && (p.responseText||'').indexOf('tv-root')>=0); } };
      try{ p.onerror=function(){ end(false); }; }catch(e){}
      p.send(null);
      setTimeout(function(){ if(!ended){ try{ p.abort(); }catch(e){} end(false); } },12000);
    }catch(e){ end(false); }
  }
  /* Two ways to fetch: 'x' = XMLHttpRequest, 's' = script tag (works on every TV engine). Switch after a failure. */
  var mode='x';
  var box=document.getElementById('tv-content'), note=document.getElementById('tv-offline'), why=document.getElementById('tv-offline-why');
  function setOffline(on, code){ try{ note.style.display=on?'block':'none'; if(why){ why.innerHTML=on&&code?' ('+code+')':''; } }catch(e){} }
  function apply(html){
    fails=0; lastOk=new Date().getTime(); setOffline(false);
    if(html!==last){ try{ box.innerHTML=html; last=html; }catch(e){} }
    if(new Date().getTime()-started>RELOAD_MS){ try{ window.location.reload(); }catch(e){} }
  }
  function viaXhr(done){
    var x, ended=false;
    function end(ok, html, code){ if(ended) return; ended=true; done(ok, html, code); }
    try{
      x=new XMLHttpRequest();
      x.open('GET','/api/display/tv?via=x&t='+new Date().getTime(),true);
      try{ x.timeout=10000; x.ontimeout=function(){ end(false,'','xt'); }; }catch(e){}
      x.onreadystatechange=function(){
        if(x.readyState!==4) return;
        var code='x'+x.status;
        if(x.status!==200){
          /* Who refused: Vercel's firewall marks its blocks with x-vercel-mitigated; a proxy has another server name. */
          try{ var m=x.getResponseHeader('x-vercel-mitigated'), sv=x.getResponseHeader('server'); if(m){ code+=' '+m; } if(sv){ code+=' '+String(sv).slice(0,16); } }catch(e){}
        }
        end(x.status===200, x.responseText, code);
      };
      try{ x.onerror=function(){ end(false,'','xe'); }; }catch(e){}
      x.send(null);
      setTimeout(function(){ if(!ended){ try{ x.abort(); }catch(e){} end(false,'','xw'); } },12000);
    }catch(e){ end(false,'','xc'); }
  }
  function viaScript(done){
    var name='__tvUpdate'+(++seq), s, ended=false;
    var head=document.getElementsByTagName('head')[0]||document.body;
    function end(ok, html, code){
      if(ended) return; ended=true;
      try{ window[name]=function(){}; }catch(e){}
      try{ if(s&&s.parentNode){ s.parentNode.removeChild(s); } }catch(e){}
      done(ok, html, code);
    }
    try{
      window[name]=function(html){ end(true, html, 's'); };
      s=document.createElement('script');
      s.type='text/javascript';
      s.onerror=function(){ end(false,'','se'); };
      s.src='/api/display/tv?via=s&cb='+name+'&t='+new Date().getTime();
      head.appendChild(s);
      setTimeout(function(){ end(false,'','sw'); },12000);
    }catch(e){ end(false,'','sc'); }
  }
  function update(){
    if(busy) return; busy=true;
    var fetcher = mode==='x' ? viaXhr : viaScript;
    fetcher(function(ok, html, code){
      busy=false;
      if(ok && html && html.indexOf('tv-header')>=0){ apply(html); }
      else {
        fails++; mode = mode==='x' ? 's' : 'x';
        if(new Date().getTime()-lastOk>=OFFLINE_AFTER_MS) setOffline(true, code);
        if(new Date().getTime()-lastOk>=HEAL_AFTER_MS) heal();
        /* Retry right away with the other method instead of waiting a full interval. */
        if(fails===1){ setTimeout(update, 1500); }
      }
    });
  }
  setInterval(update, UPDATE_MS);
  setTimeout(update, 3000);
  function wake(){ try{ if(navigator.wakeLock && navigator.wakeLock.request){ navigator.wakeLock.request('screen')['catch'](function(){}); } }catch(e){} }
  wake();
  try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden){ wake(); update(); } }); }catch(e){}
})();`;
