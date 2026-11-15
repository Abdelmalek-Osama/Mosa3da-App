/**
 * Smart-TV and other old browsers cannot run the live board (modern CSS and
 * JavaScript), so they get the server-rendered TV board that reloads itself.
 * ?mode=tv / ?mode=live override the detection.
 */
export function wantsTvBoard(userAgent: string, mode: string | undefined): boolean {
  if (mode === "tv") return true;
  if (mode === "live") return false;
  if (/Web0S|webOS|NetCast|Tizen|SMART-TV|SmartTV|HbbTV|BRAVIA|VIDAA|Opera TV|Presto|AFT[A-Z]|CrKey|Roku|Hisense|Philips|NETTV|Viera|TOSHIBA|TSBNetTV|Panasonic|Sharp|TCL|NetFront|Espial|Maple/i.test(userAgent))
    return true;
  const chrome = /(?:Chrome|Chromium|CriOS)\/(\d+)/.exec(userAgent);
  if (chrome) return Number(chrome[1]) < 84; // flex gap, clamp(), min()
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return Number(firefox[1]) < 75;
  const safari = /Version\/(\d+)[\d.]*\s.*Safari/.exec(userAgent);
  if (safari) return Number(safari[1]) < 14;
  // Anything not clearly a modern browser (unknown TV engines) gets the TV board: it works everywhere.
  return true;
}
