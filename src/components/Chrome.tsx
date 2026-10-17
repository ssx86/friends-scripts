// 全站交互岛屿：顶栏（搜索/工具）+ 命令式侧栏 + 词典面板 + 全局键盘
import { useEffect, useState } from "preact/hooks";
import { tipInit, tipHandlers, onSeason, toggleDict, dictOn, applyThemeBtn, adjustFz, esc } from "./tip.ts";
import { applyEpisode, bindLineButtons, globalStats, levelName, levelOrder, resetMastery, applySeasonStats, AccountSwitcher } from "./mastery.tsx";
import { startFocusMode } from "./focus.tsx";

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
    if (s) {
      applyEpisode().then((st) => {
        // sticky mini progress bar
        if (st && st.totalDialogue) {
          let mini = document.getElementById("mini-progress");
          if (!mini) { mini = document.createElement("div"); mini.id = "mini-progress"; mini.className = "mini-progress"; mini.innerHTML = '<div class="mini-fill"></div>'; document.body.appendChild(mini); }
          const pct = Math.round((1 - st.pendingLines / st.totalDialogue) * 100);
          (mini.querySelector(".mini-fill")).style.width = pct + "%";
        }
      });
      bindLineButtons();
    }
    else if (location.pathname === BASE || location.pathname === BASE + "index.html") { renderGlobalStats(); applySeasonStats(); }
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
        <svg class="cup" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="brandCupG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity=".9"/>
              <stop offset="1" stop-color="currentColor" stop-opacity=".6"/>
            </linearGradient>
          </defs>
          <circle cx="32" cy="36" r="26" fill="currentColor" opacity=".06"/>
          <path d="M18 26h24v16a12 12 0 0 1-12 12h0a12 12 0 0 1-12-12V26z" fill="url(#brandCupG)"/>
          <ellipse cx="30" cy="26" rx="12" ry="3.2" fill="currentColor" opacity=".55"/>
          <ellipse cx="30" cy="26" rx="10" ry="2.3" fill="#2a1a0e" opacity=".8"/>
          <path d="M42 30h5a6 6 0 0 1 0 12h-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".7"/>
          <path d="M22 28v12" stroke="#fff" stroke-opacity=".12" stroke-width="2" stroke-linecap="round"/>
          <ellipse cx="30" cy="54" rx="10" ry="2" fill="#000" opacity=".15"/>
          <path d="M25 22c-.8-2.5 1-3.5 0-6s1.5-3 .5-5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>
          <path d="M31 21c-.8-2.5 1-3.5 0-6s1.5-3 .5-5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>
          <path d="M37 22c-.8-2.5 1-3.5 0-6s1.5-3 .5-5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".25"/>
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
        <AccountSwitcher />
        <button class="tbtn" id="focus-btn" title="专注模式：逐句过一遍" onClick={() => startFocusMode()}>▶ 专注</button>
        <a class="tbtn" id="vocab-btn" href={BASE + "vocab/"} title="单词表">词表</a>
        <button class={`tbtn${dictOn() ? " on" : ""}`} id="dict-toggle" title="悬浮查词开关" onClick={(e) => toggleDict(e.currentTarget)}>{dictOn() ? "词 ON" : "词 OFF"}</button>
        <button class="tbtn" id="fz-dec" onClick={() => adjustFz(-0.08)}>A-</button>
        <button class="tbtn" id="fz-inc" onClick={() => adjustFz(0.08)}>A+</button>
        <button class="tbtn" id="theme" onClick={() => applyThemeBtn()}>☾</button>
      </div>
    </div>
  );
}

async function renderGlobalStats() {
  const body = document.getElementById("mastery-body");
  if (!body) return;
  try {
    const st = await globalStats();
    const rows = levelOrder.filter((k) => st.per[k] > 0);
    body.innerHTML = `
      <div class="vsub">已掌握 ${st.done} / ${st.total} 句 · 未掌握词 ${st.unWords} 个 · 按未掌握词的最高级别归句：</div>
      <div class="mrow">
        ${rows.map((k) => `<span class="mchip lv-${k || "top"}"><b>${st.per[k]}</b> 句 · ${levelName(k)}</span>`).join("")}
        ${!rows.length ? '<span class="vsub">全部掌握！</span>' : ""}
      </div>
      <a class="mreset" id="mreset">重置进度</a>`;
    document.getElementById("mreset").addEventListener("click", function (this: HTMLElement) {
      const self = this;
      if (self.classList.contains("arm")) { resetMastery(); renderGlobalStats(); }
      else { self.classList.add("arm"); self.textContent = "再点一次确认重置"; setTimeout(() => { self.classList.remove("arm"); self.textContent = "重置进度"; }, 3000); }
    });
  } catch (e) {
    body.innerHTML = '<div class="vsub">统计载入失败：' + (e as Error).message + "</div>";
  }
}
