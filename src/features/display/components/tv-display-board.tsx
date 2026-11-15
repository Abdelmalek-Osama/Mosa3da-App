import type { DisplayBoard } from "@/features/queue/schemas";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { TEXT, clock, longDate, remaining } from "@/features/display/display-text";

/** Seconds between automatic reloads of the TV board. */
export const TV_REFRESH_SECONDS = 15;
const PER_COLUMN = 8;

/**
 * Lobby board for smart-TV and other old browsers: fully server-rendered, no
 * client JavaScript needed, and only CSS that old engines understand (no
 * grid, no CSS variables, no clamp()/min(), no space-separated rgb(), no flex
 * gap). It reloads itself every TV_REFRESH_SECONDS. Modern browsers get the
 * live board (DisplayBoardView) instead; see src/app/display/page.tsx.
 */
export function TvDisplayBoard({ board, now }: { board: DisplayBoard | null; now: number }) {
  const tz = board?.clinic.timezone ?? DEFAULT_TIMEZONE;
  const bilingual = board?.clinic.bilingual ?? false;
  const t = TEXT.ar;
  const empty = !board || (!board.session_open && !board.current && board.waiting.length === 0 && (board.booked?.length ?? 0) === 0);

  type Row = { key: string; number: string; name: string; nameEn: string | null; at: string | null; lobby: boolean; late: boolean; shifted: boolean; delayed: boolean; slot: string | null };
  const rows: Row[] = board
    ? [
        ...board.waiting.map((w, i) => ({
          key: `w${i}`,
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
        ...(board.booked ?? []).map((b, i) => ({
          key: `b${i}`,
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
    if (!at) return null;
    const minutes = Math.ceil((new Date(at).getTime() - now) / 60_000);
    return (
      <div className="tv-timing">
        <div className="tv-left">{minutes <= 0 ? t.anyMinute : `${t.left} ${remaining(minutes, "ar")}`}</div>
        {withEta ? (
          <div className="tv-eta">
            {t.eta} {clock(at, tz, "ar")}
          </div>
        ) : null}
      </div>
    );
  };
  const nameOf = (p: { name_ar?: string; display_name?: string }) => p.name_ar ?? p.display_name ?? "";

  return (
    <div className="tv-root" dir="rtl" lang="ar">
      <style dangerouslySetInnerHTML={{ __html: TV_CSS }} />
      {/* Reload: meta refresh works without JavaScript; the timer is a second safety net. */}
      <meta httpEquiv="refresh" content={String(TV_REFRESH_SECONDS)} />
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){try{location.reload()}catch(e){}},${(TV_REFRESH_SECONDS + 5) * 1000});`,
        }}
      />

      <div className="tv-header">
        <div className="tv-brand">
          <div className="tv-clinic">{board?.clinic.name_ar ?? "عيادة د. رودينا مدحت"}</div>
          {bilingual ? <div className="tv-clinic-en" dir="ltr">{board?.clinic.name ?? ""}</div> : null}
        </div>
        <div className="tv-clock">
          <div className="tv-time">{clock(now, tz, "ar")}</div>
          <div className="tv-date">{longDate(now, tz, "ar")}</div>
        </div>
      </div>

      {empty ? (
        <div className="tv-closed">
          <div className="tv-closed-title">{t.closed}</div>
          {bilingual ? <div className="tv-closed-en" dir="ltr">{TEXT.en.closed}</div> : null}
          <div className="tv-closed-body">{t.closedBody}</div>
        </div>
      ) : (
        <div className="tv-main">
          <div className="tv-cards">
            {board!.current ? (
              <div className="tv-card tv-now">
                <div className="tv-card-label">{t.now}</div>
                <div className="tv-card-body">
                  <div className="tv-big">{board!.current.queue_number ?? "—"}</div>
                  <div className="tv-card-info">
                    <div className="tv-card-name">{nameOf(board!.current)}</div>
                    <div className="tv-card-sub">{t.comeIn}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="tv-card tv-idle">
                <div className="tv-idle-text">{t.idle}</div>
              </div>
            )}
            {board!.next ? (
              <div className="tv-card tv-next">
                <div className="tv-card-label tv-amber">{t.next}</div>
                <div className="tv-card-body">
                  <div className="tv-big tv-big-next tv-amber">{board!.next.queue_number ?? "—"}</div>
                  <div className="tv-card-info">
                    <div className="tv-card-name tv-next-name">{nameOf(board!.next)}</div>
                    {timing(board!.next.expected_start_at, true)}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="tv-list">
            <div className="tv-list-head">
              <span className="tv-list-title">{t.waiting}</span>
              <span className="tv-count">{rows.length}</span>
            </div>
            {shown.length === 0 ? (
              <div className="tv-nobody">{t.nobody}</div>
            ) : (
              <div className={twoCols ? "tv-rows tv-two" : "tv-rows"}>
                {shown.map((r) => (
                  <div key={r.key} className="tv-row-wrap">
                    <div className="tv-row">
                      <div className="tv-num">{r.number}</div>
                      <div className="tv-info">
                        <div className="tv-name">{r.name}</div>
                        {r.nameEn ? <div className="tv-name-en" dir="ltr">{r.nameEn}</div> : null}
                        <div className="tv-badges">
                          {r.lobby ? <span className="tv-badge tv-b-green">{t.inLobby}</span> : <span className="tv-badge tv-b-blue">{t.notArrived}</span>}
                          {r.delayed ? <span className="tv-badge tv-b-red">{t.delayed}</span> : null}
                          {r.shifted ? <span className="tv-badge tv-b-amber">{t.shifted}</span> : null}
                          {r.late ? <span className="tv-badge tv-b-red">{t.late}</span> : null}
                          {r.slot ? (
                            <span className="tv-slot">
                              {t.slot} {r.slot}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {timing(r.at, r.lobby)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hidden > 0 ? (
              <div className="tv-more">
                +{hidden} {t.more}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="tv-footer">
        <span>{t.estimates}</span>
        <span>{t.checkIn}</span>
      </div>
    </div>
  );
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
