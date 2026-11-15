import type { Metadata } from "next";
import { headers } from "next/headers";
import { wantsTvBoard } from "@/features/display/tv-detect";

export const metadata: Metadata = { title: "Display check", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Open on the lobby TV to see what its browser reports and which board it
 * gets. Server-rendered with inline CSS so it works on any TV browser; the
 * JavaScript line turns green only if the browser can run scripts.
 */
export default function DisplayCheckPage() {
  const ua = headers().get("user-agent") ?? "(none)";
  const tv = wantsTvBoard(ua, undefined);
  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "#111c33", color: "#ffffff", fontFamily: "Tahoma, Arial, sans-serif", fontSize: "2.2vw", padding: "3vw", overflow: "auto" }}>
      <div style={{ fontSize: "1.6em", fontWeight: "bold", marginBottom: "0.8em" }}>Display check / فحص الشاشة</div>
      <div style={{ marginBottom: "0.6em" }}>
        Board served to this screen:{" "}
        <b style={{ color: tv ? "#fcd34d" : "#55d8cb" }}>{tv ? "TV version (auto-refresh every 15 s)" : "Live version"}</b>
      </div>
      <div id="js-line" style={{ marginBottom: "0.6em", color: "#fca5a5" }}>
        JavaScript: not running
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "var l=document.getElementById('js-line');l.innerHTML='JavaScript: running';l.style.color='#6ee7b7';" +
            "var g=document.createElement('div');g.style.display='grid';var f=document.createElement('div');f.style.color='rgb(1 2 3 / 50%)';" +
            "var info=document.createElement('div');info.style.marginBottom='0.6em';" +
            "info.innerHTML='Screen: '+screen.width+'×'+screen.height+' · Window: '+window.innerWidth+'×'+window.innerHeight+' · CSS grid: '+(g.style.display==='grid'?'yes':'no')+' · Modern colors: '+(f.style.color?'yes':'no');" +
            "l.parentNode.insertBefore(info,l.nextSibling);",
        }}
      />
      <div style={{ marginTop: "1em", color: "#c4d4ec" }}>Browser identity (please send a photo of this page):</div>
      <div dir="ltr" style={{ marginTop: "0.4em", padding: "0.8em", background: "rgba(255,255,255,0.08)", borderRadius: "0.4em", wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.9em" }}>
        {ua}
      </div>
      <div style={{ marginTop: "1.2em" }}>
        <a href="/display" style={{ color: "#55d8cb" }}>
          Open the board / فتح الشاشة
        </a>
      </div>
    </div>
  );
}
