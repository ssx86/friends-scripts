// 主入口：路由 + 外壳（顶栏 / 侧栏 / 工具 / 全局快捷键）
import { useEffect, useMemo, useState } from "preact-hooks";
import { render } from "preact";
import { html, esc, whoClass, SEASON_DOTS } from "./ui.js";
import { getFlat } from "./data.js";
import { tipState, initTip, applyDictOn, attachTipHandlers, hideTip } from "./tip.js";
import { Landing } from "./views/landing.js";
import { Reader } from "./views/reader.js";
import { Vocab, WordDrill } from "./views/vocab.js";
import { SearchResults } from "./search.js";

/* ── 路由：#/ 和 #/vocab、#/word/x、#/s1e12（兼容旧 #s1e12） ── */
function parseRoute(hash) {
  let h = hash.replace(/^#\/?/, "");
  let m = h.match(/^s(\d+)e([\w-]+)$/);
  if (m) return { name: "episode", s: +m[1], e: m[2] };
  if (h === "vocab") return { name: "vocab" };
  m = h.match(/^word\/(.+)$/);
  if (m) return { name: "word", word: m[1] };
  return { name: "landing" };
}
function routeToHash(r) {
  if (r.name === "episode") return `s${r.s}e${r.e}`;
  if (r.name === "vocab") return "vocab";
  if (r.name === "word") return `word/${r.word}`;
  return "";
}

/* ── 主题 / 字号 ── */
function useTheme() {
  const [theme, setTheme] = useState(localStorage.getItem("fs_theme") || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.getElementById("theme").textContent = theme === "dark" ? "☀" : "☾";
    localStorage.setItem("fs_theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => t === "dark" ? "light" : "dark")];
}
function useFontSize() {
  const [fz, setFz] = useState(+(localStorage.getItem("fs_fz") || 1));
  useEffect(() => {
    document.documentElement.style.setProperty("--fz", fz);
    localStorage.setItem("fs_fz", fz);
  }, [fz]);
  return [fz, (d) => setFz((v) => Math.min(1.45, Math.max(.85, +(v + d).toFixed(2))))];
}

/* 跳行定位不进 hash，经模块级变量传递（组件 re-render 不丢失） */
let pendingFocus = null;

function App() {
  const [route, setRoute] = useState(parseRoute(location.hash));
  const [searchQ, setSearchQ] = useState("");
  const [flat, setFlat] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, toggleTheme] = useTheme();
  const [, adjustFz] = useFontSize();
  const [dictOn, setDictOn] = useState(tipState.on);

  const go = (path, opts = {}) => {
    pendingFocus = opts.focusLine != null ? opts.focusLine : null;
    location.hash = "/" + path;
    setSearchQ("");
    document.getElementById("q").value = "";
  };

  useEffect(() => {
    const onHash = () => {
      const r = parseRoute(location.hash);
      if (pendingFocus != null && r.name === "episode") { r.focusLine = pendingFocus; }
      pendingFocus = null;
      setRoute(r);
    };
    addEventListener("hashchange", onHash);
    initTip();
    attachTipHandlers(document.getElementById("root"));
    getFlat().then(setFlat);
    /* 全局键盘：/ 聚焦搜索；Esc 关面板；←→ 上下集 */
    addEventListener("keydown", (e) => {
      const typing = e.target.tagName === "INPUT";
      if (e.key === "/" && !typing) { e.preventDefault(); const q = document.getElementById("q"); q.focus(); q.select(); return; }
      if (e.key === "Escape") { hideTip(); return; }
      if (typing) return;
      if (route.name === "episode" && flat) {
        const i = flat.findIndex((x) => x.s === route.s && String(x.e) === String(route.e));
        if (e.key === "ArrowLeft" && i > 0) go(`s${flat[i - 1].s}e${flat[i - 1].e}`);
        if (e.key === "ArrowRight" && i >= 0 && i < flat.length - 1) go(`s${flat[i + 1].s}e${flat[i + 1].e}`);
      }
    });
    return () => removeEventListener("hashchange", onHash);
  }, []);

  /* 搜索输入：防抖即搜 */
  const [qInput, setQInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(qInput), 220);
    return () => clearTimeout(t);
  }, [qInput]);

  const main = useMemo(() => {
    if (searchQ.trim().length >= 2) return html`<${SearchResults} query=${searchQ} go=${go} />`;
    if (route.name === "episode" && flat) return html`<${Reader} route=${route} flat=${flat} go=${go} key=${`s${route.s}e${route.e}`} />`;
    if (route.name === "vocab") return html`<${Vocab} go=${go} />`;
    if (route.name === "word") return html`<${WordDrill} route=${route} go=${go} key=${route.word} />`;
    return html`<${Landing} go=${go} />`;
  }, [route, flat, searchQ]);

  const curIndex = route.name === "episode" && flat ? flat.findIndex((x) => x.s === route.s && String(x.e) === String(route.e)) : -1;

  return html`<div>
    <div class="topbar">
      <button class="sidebar-toggle" id="sb-toggle" aria-label="剧集列表" onClick=${() => setSidebarOpen(!sidebarOpen)}>☰</button>
      <a class="brand" href="#/" onClick=${(e) => { e.preventDefault(); location.hash = "/"; setSearchQ(""); document.getElementById("q").value = ""; }}>
        <svg class="cup" viewBox="0 0 64 64" fill="none" dangerouslySetInnerHTML=${{ __html: `<path d="M18 30h22v10a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10z" fill="currentColor"/><path d="M40 32h4.5a5.5 5.5 0 0 1 0 11H40" stroke="currentColor" stroke-width="3.5"/><path d="M24 24c0-2.5 3.5-2.5 3.5-5M32 24c0-2.5 3.5-2.5 3.5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>` }} />
        <span class="bt"><b>老友记<i>·</i>台词库</b><span>FRIENDS&nbsp;SCRIPTS&nbsp;·&nbsp;CENTRAL&nbsp;PERK</span></span>
      </a>
      <div class="searchbox">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="text" placeholder="搜索任意台词（支持拼错），如 how you doin" autocomplete="off"
          onInput=${(e) => setQInput(e.target.value)} value=${qInput} />
        <span class="shint">/</span>
      </div>
      <div class="tools">
        <button class="tbtn" id="vocab-btn" title="单词表" onClick=${() => { go("vocab"); setSearchQ(""); document.getElementById("q").value = ""; }}>词表</button>
        <button class="tbtn${dictOn ? " on" : ""}" id="dict-toggle" title="悬浮查词开关"
          onClick=${() => { tipState.on = !tipState.on; localStorage.setItem("fs_dict", tipState.on ? "1" : "0"); applyDictOn(); setDictOn(tipState.on); if (!tipState.on) hideTip(); }}>
          词 ${dictOn ? "ON" : "OFF"}
        </button>
        <button class="tbtn" id="fz-dec" onClick=${() => adjustFz(-0.08)}>A-</button>
        <button class="tbtn" id="fz-inc" onClick=${() => adjustFz(0.08)}>A+</button>
        <button class="tbtn" id="theme" onClick=${toggleTheme}>☾</button>
      </div>
    </div>

    <div class="layout">
      <${Sidebar} flat=${flat} curIndex=${curIndex} open=${sidebarOpen} onClose=${() => setSidebarOpen(false)} go=${go} />
      <div class="scrim${sidebarOpen ? " show" : ""}" id="scrim" onClick=${() => setSidebarOpen(false)}></div>
      <main class="main" id="main">${main}</main>
    </div>

    <button class="backtop" id="backtop" aria-label="回到顶部"
      onClick=${() => scrollTo({ top: 0, behavior: "smooth" })}
      dangerouslySetInnerHTML=${{ __html: `<svg viewBox="0 0 64 64" fill="none"><path d="M32 8c-2 8-12 10-20 8 4 4 8 6 12 6l4 26h8l4-26c4 0 8-2 12-6-8 2-18 0-20-8z" fill="currentColor" opacity=".9"/><path d="M32 48v8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>` }} />
  </div>`;
}

function Sidebar({ flat, curIndex, open, onClose, go }) {
  useEffect(() => {
    addEventListener("scroll", () => {
      document.getElementById("backtop").classList.toggle("show", scrollY > 500);
    }, { passive: true });
  }, []);
  if (!flat) return html`<aside class="sidebar" id="sidebar"></aside>`;
  const byS = new Map();
  flat.forEach((it, i) => { if (!byS.has(it.s)) byS.set(it.s, []); byS.get(it.s).push({ ...it, i }); });
  const first = curIndex >= 0 ? flat[curIndex].s : 1;
  return html`<aside class="sidebar${open ? " show" : ""}" id="sidebar">
    ${[...byS.entries()].sort((a, b) => a[0] - b[0]).map(([s, eps]) => html`
      <div class="season-block${s === first ? " open" : ""}" key=${s}>
        <div class="season-head" onClick=${(e) => e.currentTarget.parentElement.classList.toggle("open")}>
          <span class="tri">▶</span><span class="dot" style=${{ background: SEASON_DOTS[s - 1] }}></span> Season ${s}<span class="cnt">${eps.length} 集</span>
        </div>
        <div class="eps">
          ${eps.map((it) => html`<div class="ep${it.i === curIndex ? " on" : ""}" key=${s + "-" + it.e}
            onClick=${() => { go(`s${it.s}e${it.e}`); onClose(); }}>
            <span class="no">${it.e}</span><span class="t">${it.t}</span>
          </div>`)}
        </div>
      </div>`)}
  </aside>`;
}

render(html`<${App} />`, document.getElementById("root"));
