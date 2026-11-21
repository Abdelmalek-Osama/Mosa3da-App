import type { DisplayBoard } from "@/features/queue/schemas";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import { TEXT, clock, longDate, remaining } from "@/features/display/display-text";

/** Seconds between background updates of the TV board. */
export const TV_UPDATE_SECONDS = 15;
/** Occasional clean reload (only when the board page is reachable) to refresh the page and free memory. */
export const TV_RELOAD_HOURS = 12;
/** Without JavaScript the page can only reload itself; slower, to limit risk on a flaky network. */
const TV_NOSCRIPT_REFRESH_SECONDS = 60;
const PER_COLUMN = 8;

/**
 * Lobby board for smart-TV and other old browsers. Only CSS that old engines
 * understand (no grid, no CSS variables, no clamp()/min(), no space-separated
 * rgb(), no flex gap) and a tiny ES5 script:
 *   - loads once, then every TV_UPDATE_SECONDS fetches the board straight from
 *     Supabase (fallback: /api/display/tv) and swaps it in when it changed;
 *   - if the network or server fails, the last board stays on screen with a
 *     small "Reconnecting" note: never a browser error page;
 *   - every TV_RELOAD_HOURS it may do a clean reload, only when the board page
 *     is reachable, to refresh the page and free the TV browser's memory;
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
      <script
        dangerouslySetInnerHTML={{
          __html: tvScript({
            supabaseUrl: publicEnv.supabaseUrl,
            supabaseKey: publicEnv.supabaseKey,
            tzOffsetMinutes: tzOffsetMinutes(board?.clinic.timezone ?? DEFAULT_TIMEZONE),
            text: TEXT.ar,
            closedEn: TEXT.en.closed,
            defaultClinicAr: "عيادة د. رودينا مدحت",
            perColumn: PER_COLUMN,
          }),
        }}
      />
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

/** Everything the TV script needs, rendered into the page by the server (all public values). */
export interface TvScriptConfig {
  supabaseUrl: string;
  supabaseKey: string;
  /** Clinic timezone offset from UTC in minutes, at page render (refreshed by the occasional reload). */
  tzOffsetMinutes: number;
  text: (typeof TEXT)["ar"];
  closedEn: string;
  defaultClinicAr: string;
  perColumn: number;
}

/** Current UTC offset of a timezone in minutes (e.g. Africa/Cairo → 120 or 180). */
export function tzOffsetMinutes(timeZone: string, at = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/*
 * ES5 only (the clinic TV is Chrome 47): no arrow functions, const/let,
 * fetch or promises (except behind a feature check). Defensive: every step is
 * wrapped so one failure never blanks the screen.
 *
 * Updates: primary path is a direct XHR to Supabase (rpc/get_display_board,
 * public anon access, CORS *), rendered here with the same markup as
 * renderTvBoardHtml(). It does not go through Vercel, whose firewall
 * challenges this old browser. Fallbacks: /api/display/tv via XHR, then via a
 * script tag. A Vercel beacon each minute keeps the "last seen" log and the
 * WhatsApp timers going; its failures are ignored.
 *
 * Reloads: only after a probe of the board page itself (XHR /display?probe,
 * 200 with the TV board inside) succeeds: after 3+ minutes without updates,
 * and every 12 hours to refresh the page. Never into a challenge or error page.
 */
function tvScript(cfg: TvScriptConfig): string {
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `(function(){
  var C=${json};
  var UPDATE_MS=${TV_UPDATE_SECONDS * 1000}, RELOAD_MS=${TV_RELOAD_HOURS * 3600 * 1000}, HEAL_AFTER_MS=180000, OFFLINE_AFTER_MS=120000, BEACON_MS=60000;
  var started=new Date().getTime(), lastOk=started, busy=false, last='', seq=0, probing=false;
  var modes=['d','x','s'], mode=0, chain=0;
  var box=document.getElementById('tv-content'), note=document.getElementById('tv-offline'), why=document.getElementById('tv-offline-why');
  var T=C.text;
  function now(){ return new Date().getTime(); }
  function setOffline(on, code){ try{ note.style.display=on?'block':'none'; if(why){ why.innerHTML=on&&code?' ('+code+')':''; } }catch(e){} }

  /* ---- formatting (clinic time from a fixed UTC offset) ---- */
  function pad(n){ return (n<10?'0':'')+n; }
  function ms(iso){ if(typeof iso==='number') return iso; var t=Date.parse(String(iso).replace(/(\\.\\d{3})\\d+/,'$1').replace(' ','T')); return isNaN(t)?0:t; }
  function local(t){ return new Date(ms(t)+C.tzOffsetMinutes*60000); }
  function clock(t){ var d=local(t), h=d.getUTCHours(), h12=h%12||12; return pad(h12)+':'+pad(d.getUTCMinutes())+' '+(h<12?'ص':'م'); }
  var DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  var MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  function longDate(t){ var d=local(t); return DAYS[d.getUTCDay()]+'، '+d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]; }
  function remaining(total){
    var h=Math.floor(total/60), m=total%60;
    var hours=h===1?'ساعة':h===2?'ساعتان':h<=10?h+' ساعات':h+' ساعة';
    var mins=m===1?'دقيقة':m===2?'دقيقتان':m<=10?m+' دقائق':m+' دقيقة';
    if(!h) return mins;
    return m?hours+' و'+mins:hours;
  }
  function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  /* ---- same markup as renderTvBoardHtml() ---- */
  function render(b){
    var nowMs=ms(b && b.generated_at) || now();
    var bilingual=!!(b && b.clinic && b.clinic.bilingual);
    var waiting=(b && b.waiting) || [], booked=(b && b.booked) || [];
    var empty=!b || (!b.session_open && !b.current && waiting.length===0 && booked.length===0);
    var rows=[], i, r;
    for(i=0;i<waiting.length;i++){ var w=waiting[i]; rows.push({ number: w.queue_number!=null?String(w.queue_number):'—', name: w.name_ar||w.display_name||'', nameEn: bilingual?(w.name_en||null):null, at: w.expected_start_at||null, lobby:true, late:!!w.is_late, shifted:false, delayed:false, slot:null }); }
    for(i=0;i<booked.length;i++){ var k=booked[i]; rows.push({ number:'·', name:k.name_ar||'', nameEn: bilingual?(k.name_en||null):null, at:k.slot_start, lobby:false, late:false, shifted:(k.grace_shifts||0)>0 && !k.is_delayed, delayed:!!k.is_delayed, slot: clock(k.slot_start)+(k.slot_end?' - '+clock(k.slot_end):'') }); }
    rows.sort(function(a,c){ var x=a.at?ms(a.at):9e15, y=c.at?ms(c.at):9e15; return x-y; });
    var two=rows.length>6, shown=rows.slice(0, two?C.perColumn*2:6), hidden=rows.length-shown.length;
    function timing(at, eta){
      if(!at) return '';
      var mins=Math.ceil((ms(at)-nowMs)/60000);
      return '<div class="tv-timing"><div class="tv-left">'+esc(mins<=0?T.anyMinute:(T.left+' '+remaining(mins)))+'</div>'+(eta?'<div class="tv-eta">'+esc(T.eta+' '+clock(at))+'</div>':'')+'</div>';
    }
    function nameOf(p){ return p.name_ar||p.display_name||''; }
    var clinicAr=(b && b.clinic && b.clinic.name_ar) || C.defaultClinicAr;
    var html='<div class="tv-header"><div class="tv-brand"><div class="tv-clinic">'+esc(clinicAr)+'</div>'+(bilingual?'<div class="tv-clinic-en" dir="ltr">'+esc(b.clinic.name||'')+'</div>':'')+
      '</div><div class="tv-clock"><div class="tv-time">'+esc(clock(nowMs))+'</div><div class="tv-date">'+esc(longDate(nowMs))+'</div></div></div>';
    if(empty){
      html+='<div class="tv-closed"><div class="tv-closed-title">'+esc(T.closed)+'</div>'+(bilingual?'<div class="tv-closed-en" dir="ltr">'+esc(C.closedEn)+'</div>':'')+'<div class="tv-closed-body">'+esc(T.closedBody)+'</div></div>';
    } else {
      html+='<div class="tv-main"><div class="tv-cards">';
      html+= b.current
        ? '<div class="tv-card tv-now"><div class="tv-card-label">'+esc(T.now)+'</div><div class="tv-card-body"><div class="tv-big">'+esc(b.current.queue_number!=null?b.current.queue_number:'—')+'</div><div class="tv-card-info"><div class="tv-card-name">'+esc(nameOf(b.current))+'</div><div class="tv-card-sub">'+esc(T.comeIn)+'</div></div></div></div>'
        : '<div class="tv-card tv-idle"><div class="tv-idle-text">'+esc(T.idle)+'</div></div>';
      if(b.next){
        html+='<div class="tv-card tv-next"><div class="tv-card-label tv-amber">'+esc(T.next)+'</div><div class="tv-card-body"><div class="tv-big tv-big-next tv-amber">'+esc(b.next.queue_number!=null?b.next.queue_number:'—')+'</div><div class="tv-card-info"><div class="tv-card-name tv-next-name">'+esc(nameOf(b.next))+'</div>'+timing(b.next.expected_start_at,true)+'</div></div></div>';
      }
      html+='</div><div class="tv-list"><div class="tv-list-head"><span class="tv-list-title">'+esc(T.waiting)+'</span><span class="tv-count">'+rows.length+'</span></div>';
      if(shown.length===0){ html+='<div class="tv-nobody">'+esc(T.nobody)+'</div>'; }
      else {
        html+='<div class="'+(two?'tv-rows tv-two':'tv-rows')+'">';
        for(i=0;i<shown.length;i++){
          r=shown[i];
          var badges=(r.lobby?'<span class="tv-badge tv-b-green">'+esc(T.inLobby)+'</span>':'<span class="tv-badge tv-b-blue">'+esc(T.notArrived)+'</span>')+
            (r.delayed?'<span class="tv-badge tv-b-red">'+esc(T.delayed)+'</span>':'')+
            (r.shifted?'<span class="tv-badge tv-b-amber">'+esc(T.shifted)+'</span>':'')+
            (r.late?'<span class="tv-badge tv-b-red">'+esc(T.late)+'</span>':'')+
            (r.slot?'<span class="tv-slot">'+esc(T.slot+' '+r.slot)+'</span>':'');
          html+='<div class="tv-row-wrap"><div class="tv-row"><div class="tv-num">'+esc(r.number)+'</div><div class="tv-info"><div class="tv-name">'+esc(r.name)+'</div>'+
            (r.nameEn?'<div class="tv-name-en" dir="ltr">'+esc(r.nameEn)+'</div>':'')+'<div class="tv-badges">'+badges+'</div></div>'+timing(r.at,r.lobby)+'</div></div>';
        }
        html+='</div>';
      }
      if(hidden>0) html+='<div class="tv-more">+'+hidden+' '+esc(T.more)+'</div>';
      html+='</div></div>';
    }
    html+='<div class="tv-footer"><span>'+esc(T.estimates)+'</span><span>'+esc(T.checkIn)+'</span></div>';
    return html;
  }

  /* ---- transports ---- */
  function xhr(method, url, headers, body, done, tag){
    var x, ended=false;
    function end(ok, text, code){ if(ended) return; ended=true; done(ok, text, code); }
    try{
      x=new XMLHttpRequest();
      x.open(method, url, true);
      for(var h in headers){ if(headers.hasOwnProperty(h)){ x.setRequestHeader(h, headers[h]); } }
      try{ x.timeout=10000; x.ontimeout=function(){ end(false,'',tag+'t'); }; }catch(e){}
      x.onreadystatechange=function(){
        if(x.readyState!==4) return;
        var code=tag+x.status;
        if(x.status!==200){ try{ var m=x.getResponseHeader('x-vercel-mitigated'); if(m){ code+=' '+m; } }catch(e){} }
        end(x.status===200, x.responseText, code);
      };
      try{ x.onerror=function(){ end(false,'',tag+'e'); }; }catch(e){}
      x.send(body);
      setTimeout(function(){ if(!ended){ try{ x.abort(); }catch(e){} end(false,'',tag+'w'); } },12000);
    }catch(e){ end(false,'',tag+'c'); }
  }
  function viaSupabase(done){
    var headers={ 'apikey': C.supabaseKey, 'Content-Type': 'application/json' };
    if(C.supabaseKey.indexOf('eyJ')===0){ headers['Authorization']='Bearer '+C.supabaseKey; }
    xhr('POST', C.supabaseUrl+'/rest/v1/rpc/get_display_board', headers, '{}', function(ok, text, code){
      if(!ok){ done(false,'',code); return; }
      var b=null; try{ b=JSON.parse(text); }catch(e){ done(false,'','sbj'); return; }
      var html=''; try{ html=render(b); }catch(e){ done(false,'','sbr'); return; }
      done(true, html, 'sb');
    }, 'sb');
  }
  function viaVercel(done){ xhr('GET','/api/display/tv?via=x&t='+now(),{},null,done,'x'); }
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
      s.src='/api/display/tv?via=s&cb='+name+'&t='+now();
      head.appendChild(s);
      setTimeout(function(){ end(false,'','sw'); },12000);
    }catch(e){ end(false,'','sc'); }
  }

  /* ---- reload only when the board page itself is reachable ---- */
  function reloadIfPageReachable(){
    if(probing) return; probing=true;
    xhr('GET','/display?probe='+now(),{},null,function(ok, text){
      probing=false;
      if(ok && (text||'').indexOf('tv-root')>=0){ try{ window.location.reload(); }catch(e){} }
    },'p');
  }

  function apply(html){
    lastOk=now(); setOffline(false);
    if(html!==last){ try{ box.innerHTML=html; last=html; }catch(e){} }
    if(now()-started>RELOAD_MS) reloadIfPageReachable();
  }
  function update(){
    if(busy) return; busy=true;
    var m=modes[mode], fetcher=m==='d'?viaSupabase:(m==='x'?viaVercel:viaScript);
    fetcher(function(ok, html, code){
      busy=false;
      if(ok && html && html.indexOf('tv-header')>=0){ apply(html); return; }
      /* Supabase first; Vercel paths only while Supabase fails. */
      mode=(mode+1)%modes.length;
      if(now()-lastOk>=OFFLINE_AFTER_MS) setOffline(true, code);
      if(now()-lastOk>=HEAL_AFTER_MS) reloadIfPageReachable();
      if(chain<2){ chain++; setTimeout(update, 1500); }
    });
  }
  /* Back to Supabase after any fallback success, on the next round. */
  setInterval(function(){ mode=0; chain=0; update(); }, UPDATE_MS);
  setTimeout(update, 2000);

  /* "Last seen" log + WhatsApp timers via Vercel; failures don't matter. */
  function beacon(){ try{ var i=new Image(); i.src='/api/display/tv?via=d&t='+now(); }catch(e){} }
  setInterval(beacon, BEACON_MS); setTimeout(beacon, 5000);

  function wake(){ try{ if(navigator.wakeLock && navigator.wakeLock.request){ navigator.wakeLock.request('screen')['catch'](function(){}); } }catch(e){} }
  wake();
  try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden){ wake(); mode=0; update(); } }); }catch(e){}
})();`;
}
