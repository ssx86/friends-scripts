// 全站交互岛屿：顶栏（搜索/工具）+ 命令式侧栏 + 词典面板 + 全局键盘
import { useEffect, useState } from "preact/hooks";
import { tipInit, tipHandlers, onSeason, toggleDict, dictOn, applyThemeBtn, adjustFz, esc } from "./tip.ts";

const pad = (n) => String(n).padStart(2, "0");
const DOTS = ["#e0603c", "#4d8a5a", "#c9722e", "#7d64ad", "#3e7ca6", "#b0483f", "#5a8a3e", "#94639c", "#3f7f8a", "#a8683a"];
const BASE = import.meta.env.BASE_URL;
const epPath = (s, e) => `${BASE}ep/s${pad(s)}e${e}/`;
function parsePath() {
  const m = location.pathname.slice(BASE.length - 1).match(/^\/ep\/s(\d{2})e([\w-]+)\/?$/);
  return m ? { s: +m[1], e: m[2] } : null;
}

/* 侧栏：一次性命令式注入（无状态需求，避免 portal/重渲染问题） */
function buildSidebar(index) {
  const season = +(document.body.dataset.season || 0);
  const cur = parsePath();
  const byS = new Map();
  index.forEach((it) => { if (!byS.has(it.s)) byS.set(it.s, []); byS.get(it.s).push(it); });
  let html = "";
  for (const [s, eps] of [...byS.entries()].sort((a, b) => a[0] - b[0])) {
    const active = (it) => cur && cur.s === it.s && String(cur.e) === String(it.e) ? " on" : "";
    html += `<div class="season-block${s === season ? " open" : ""}">
      <div class="season-head"><span class="tri">▶</span><span class="dot" style="background:${DOTS[s - 1]}"></span> Season ${s}<span class="cnt">${eps.length} 集</span></div>
      <div class="eps">${eps.map((it) => `<a class="ep${active(it)}" href="${epPath(it.s, it.e)}"><span class="no">${it.e}</span><span class="t">${esc(it.t)}</span></a>`).join("")}</div>
    </div>`;
  }
  document.getElementById("sidebar").innerHTML = html;
  document.querySelectorAll(".season-head").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
}

export default function Chrome() {
  const [q, setQ] = useState(new URLSearchParams(location.search).get("q") || "");

  /* 初始化：一次性 */
  useEffect(() => {
    tipInit();
    tipHandlers();
    const s = +(document.body.dataset.season || 0);
    if (s) onSeason(s);
    fetch(`${BASE}data/index.json`).then((r) => r.json()).then((idx) => {
      buildSidebar(idx);
      window.__fsIndex = idx;
    });
    addEventListener("keydown", (e) => {
      const typing = e.target.tagName === "INPUT";
      if (e.key === "/" && !typing) { e.preventDefault(); const el = document.getElementById("q"); el.focus(); el.select(); return; }
      if (typing) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const cur = parsePath();
        const idx = window.__fsIndex;
        if (!cur || !idx) return;
        const i = idx.findIndex((x) => x.s === cur.s && String(x.e) === String(cur.e));
        if (e.key === "ArrowLeft" && i > 0) location.href = epPath(idx[i - 1].s, idx[i - 1].e);
        if (e.key === "ArrowRight" && i >= 0 && i < idx.length - 1) location.href = epPath(idx[i + 1].s, idx[i + 1].e);
      }
    });
  }, []);

  /* 搜索：防抖 → /search?q= */
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) return;
      if (location.pathname.startsWith(BASE + "search")) {
        dispatchEvent(new CustomEvent("fs:q", { detail: q }));
        history.replaceState(null, "", BASE + "search?q=" + encodeURIComponent(q));
      } else {
        location.href = BASE + "search?q=" + encodeURIComponent(q);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div class="topbar">
      <button class="sidebar-toggle" id="sb-toggle" aria-label="剧集列表" data-sidebar-toggle
        onClick={() => { document.getElementById("sidebar").classList.toggle("show"); document.getElementById("scrim").classList.toggle("show"); }}>☰</button>
      <a class="brand" href={BASE}>
        <svg class="cup" viewBox="0 0 64 64" fill="none">
          <path d="M18 30h22v10a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10z" fill="currentColor" />
          <path d="M40 32h4.5a5.5 5.5 0 0 1 0 11H40" stroke="currentColor" stroke-width="3.5" />
          <path d="M24 24c0-2.5 3.5-2.5 3.5-5M32 24c0-2.5 3.5-2.5 3.5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <span class="bt"><b>老友记<i>·</i>台词库</b><span>FRIENDS SCRIPTS · CENTRAL PERK</span></span>
      </a>
      <div class="searchbox">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="q" type="text" placeholder="搜索任意台词（支持拼错），如 how you doin" autocomplete="off"
          value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <span class="shint">/</span>
      </div>
      <div class="tools">
        <a class="tbtn" id="vocab-btn" href={BASE + "vocab/"} title="单词表">词表</a>
        <button class={`tbtn${dictOn() ? " on" : ""}`} id="dict-toggle" title="悬浮查词开关" onClick={(e) => toggleDict(e.currentTarget)}>{dictOn() ? "词 ON" : "词 OFF"}</button>
        <button class="tbtn" id="fz-dec" onClick={() => adjustFz(-0.08)}>A-</button>
        <button class="tbtn" id="fz-inc" onClick={() => adjustFz(0.08)}>A+</button>
        <button class="tbtn" id="theme" onClick={() => applyThemeBtn()}>☾</button>
      </div>
    </div>
  );
}
