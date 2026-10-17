// 词典悬浮系统（Preact 岛屿版）：按季词库懒加载 + 双模式面板
const TAGS = { cet4: "CET-4", cet6: "CET-6", ky: "考研", ielts: "雅思", toefl: "TOEFL", gre: "GRE" };
const EX_LABEL = { p: "过去式", d: "过去分词", i: "现在分词", "3": "三单", r: "比较级", t: "最高级", s: "原型", "0": "原形", "1": "变体" };

let tip = null, hideTimer = null;
const hasLS = typeof localStorage !== "undefined";
const st = { on: !hasLS || localStorage.getItem("fs_dict") !== "0", DICT: null, season: 0, fetching: null, word: null, display: "", complex: false, epCounts: {}, lastX: 0, lastY: 0 };

export const dictOn = () => st.on;

const BASE = import.meta.env.BASE_URL || "/";
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = (n) => String(n).padStart(2, "0");

function prefetch(s) {
  if (st.season === s && st.DICT) return;
  if (st.season === s && st.fetching) return st.fetching;
  st.season = s; st.DICT = null;
  st.fetching = fetch(`${BASE}data/dict/s${pad(s)}.json`).then((r) => r.json()).then((j) => {
    if (st.season === s) st.DICT = j;
    if (tip.classList.contains("show") && st.word) { render(st.word); place(st.lastX, st.lastY); }
  }).finally(() => { if (st.season === s) st.fetching = null; });
  return st.fetching;
}

export function onSeason(s) {
  // 词表（本集词频）从静态 DOM 统计
  st.epCounts = {};
  document.querySelectorAll(".ln .w").forEach((el) => {
    const w = el.dataset.w;
    st.epCounts[w] = (st.epCounts[w] || 0) + 1;
  });
  if (st.season !== s) { st.season = s; st.DICT = null; st.fetching = null; }
  setTimeout(() => { if (st.season === s) prefetch(s); }, 2500);
}

export function toggleDict(btn) {
  st.on = !st.on;
  localStorage.setItem("fs_dict", st.on ? "1" : "0");
  document.body.classList.toggle("dict-on", st.on);
  if (btn) { btn.textContent = st.on ? "词 ON" : "词 OFF"; btn.classList.toggle("on", st.on); }
  if (!st.on) hide();
}
export function applyThemeBtn() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("fs_theme", next);
  const b = document.getElementById("theme");
  if (b) b.textContent = next === "dark" ? "☀" : "☾";
  // 触发 Chrome 状态更新
  dispatchEvent(new CustomEvent("fs:theme", { detail: next }));
}
export function adjustFz(d) {
  const fz = Math.min(1.45, Math.max(.85, +(+(localStorage.getItem("fs_fz") || 1) + d).toFixed(2)));
  localStorage.setItem("fs_fz", fz);
  document.documentElement.style.setProperty("--fz", fz);
}

function lookupEntry(w) {
  if (!st.DICT) return null;
  let e = st.DICT.d[w], lemmaBadge = "";
  if (!e && st.DICT.l[w]) { const [base, rel] = st.DICT.l[w]; e = st.DICT.d[base]; if (e) lemmaBadge = `${base} · ${rel}`; }
  if (!e && /'s$/.test(w)) { const b = w.replace(/'s$/, ""); e = st.DICT.d[b]; if (e) lemmaBadge = `${b} · 所有格`; }
  return e ? { e, lemmaBadge } : null;
}
/* 连字符组合词：整体查不到时，按段查（长段优先），命中段作为释义 */
function lookup(w) {
  const direct = lookupEntry(w);
  if (direct) return direct;
  if (!st.DICT || !/-/.test(w)) return null;
  const bare = w.replace(/-+$/, "");
  if (bare !== w) { const r = lookupEntry(bare); if (r) { r.lemmaBadge = (r.lemmaBadge ? r.lemmaBadge + " · " : "") + bare; return r; } }
  const parts = w.split("-").filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of parts) {
    const r = lookupEntry(p);
    if (r) { r.lemmaBadge = (r.lemmaBadge ? r.lemmaBadge + " · " : "") + w + " 的组成部分"; return r; }
  }
  return null;
}

function rankBar(label, rank) {
  if (!rank) return "";
  const pct = Math.max(4, Math.round(100 * (1 - Math.log10(rank) / 5.7)));
  return `<div class="bar"><span>${label}</span><span class="rail"><span class="fill" style="width:${pct}%"></span></span><span>#${rank}</span></div>`;
}

function render(w) {
  const hit = lookup(w);
  if (!hit) {
    // 查不到：清空面板内容 + 显示"未收录"提示（防止残留上一次的内容）
    tip.classList.remove("complex");
    tip.innerHTML = `<button class="x" title="收起">✕</button>
      <div class="tw"><b>${esc(st.display)}</b></div>
      <div class="loading" style="margin-top:10px">未收录（专名或极罕见词）</div>`;
    return;  // 不调 hide()，让用户看到"未收录"而非面板闪烁消失
  }
  const [ph, def, tr, , collins, oxford, tag, bnc, frq, ex] = hit.e;
  const trLines = tr.split("\n").filter(Boolean);
  const defLines = def.split("\n").filter(Boolean);
  const chips = [];
  if (hit.lemmaBadge) chips.push(`<span class="chip door">${esc(hit.lemmaBadge)}</span>`);
  const frqTop = frq > 0 && frq <= 5000;
  if (collins && !frqTop) chips.push(`<span class="chip yellow">${"★".repeat(Math.min(collins, 5))}</span>`);
  if (oxford && !frqTop) chips.push(`<span class="chip yellow">牛津3000</span>`);
  for (const t of tag.split(" ")) if (TAGS[t] && !frqTop) chips.push(`<span class="chip">${TAGS[t]}</span>`);
  const lvl = [];
  if (bnc && !frqTop) lvl.push(`<span class="chip lvl">BNC ${bnc}</span>`);
  if (frq && !frqTop) lvl.push(`<span class="chip lvl">COCA ${frq}</span>`);
  const forms = ex.split("/").filter(Boolean).map((p) => {
    const c = p.indexOf(":");
    return c < 1 ? null : { k: p.slice(0, c), v: p.slice(c + 1) };
  }).filter((f) => f && EX_LABEL[f.k]);

  tip.classList.toggle("complex", st.complex);
  tip.innerHTML = `
    <button class="x" title="收起">✕</button>
    <div class="tw"><b>${esc(st.display)}</b>${ph ? `<span class="ph">/${esc(ph)}/</span>` : ""}</div>
    ${chips.length || lvl.length ? `<div class="chips">${chips.join("")}${st.complex ? lvl.join("") : ""}</div>` : ""}
    ${trLines.length ? `<div class="tr"><span class="first">${esc(trLines[0])}</span>${st.complex && trLines.length > 1 ? `\n<span class="rest">${esc(trLines.slice(1).join("\n"))}</span>` : ""}</div>` : ""}
    ${st.complex && defLines.length ? `<div class="en">${esc(defLines.join("\n"))}</div>` : ""}
    ${st.complex && forms.length ? `<div class="sec"><div class="sh">WORD&nbsp;FORMS&nbsp;·&nbsp;变形</div><div class="forms">${forms.map((f) => `<span class="fchip" data-lw="${esc(f.v)}"><i>${EX_LABEL[f.k]}</i>${esc(f.v)}</span>`).join("")}</div></div>` : ""}
    ${st.complex && (bnc || frq) ? `<div class="sec"><div class="sh">FREQUENCY&nbsp;·&nbsp;词频</div><div class="bars">${rankBar("BNC", bnc)}${rankBar("COCA", frq)}</div></div>` : ""}
    ${st.complex ? `<div class="sec cross"><span class="cnt">本集出现 <b>${st.epCounts[w] || 1}</b> 次</span><a href="${BASE}search?q=${encodeURIComponent(w)}">在台词中搜索 →</a></div>` : ""}
    <button class="expand">${st.complex ? "收起 ▴" : "展开全部 ▾"}</button>`;
  tip.querySelector(".x").addEventListener("click", hide);
  tip.querySelector(".expand").addEventListener("click", () => {
    st.complex = !st.complex;
    render(w);
    place(st.lastX, st.lastY);
  });
  tip.querySelectorAll(".fchip").forEach((el) => el.addEventListener("click", () => {
    const nw = el.dataset.lw;
    if (lookup(nw)) { st.word = nw; st.display = nw; st.complex = true; render(nw); place(st.lastX, st.lastY); }
    else el.style.opacity = .4;
  }));
}

function show(el, x, y) {
  clearTimeout(hideTimer);
  st.word = el.dataset.w;
  st.display = el.textContent;
  if (!st.DICT) {
    if (st.season > 0) prefetch(st.season);
    if (!st.fetching) { hide(); return; }
    tip.classList.remove("complex");
    tip.innerHTML = `<div class="loading">词库载入中…（随本集预取，仅首次）</div>`;
    place(x, y);
    return;
  }
  render(st.word);
  place(x, y);
}
function place(x, y) {
  st.lastX = x; st.lastY = y;
  tip.classList.add("show");
  const r = tip.getBoundingClientRect();
  let tx = x + 16, ty = y + 18;
  if (tx + r.width > innerWidth - 12) tx = x - r.width - 14;
  if (ty + r.height > innerHeight - 12) ty = Math.max(10, y - r.height - 14);
  tip.style.left = Math.max(10, tx) + "px";
  tip.style.top = ty + "px";
}
function hide() { clearTimeout(hideTimer); if (tip) tip.classList.remove("show"); st.complex = false; }
function queueHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 260); }

export function tipInit() {
  if (document.getElementById("tip")) { tip = document.getElementById("tip"); }
  else {
    tip = document.createElement("div");
    tip.id = "tip";
    document.body.appendChild(tip);
  }
  document.body.classList.toggle("dict-on", st.on);
  // 初始主题/字号
  document.documentElement.dataset.theme = localStorage.getItem("fs_theme") || "light";
  document.getElementById("theme").textContent = (localStorage.getItem("fs_theme") || "light") === "dark" ? "☀" : "☾";
  document.documentElement.style.setProperty("--fz", localStorage.getItem("fs_fz") || 1);
}

let handlersAttached = false;
export function tipHandlers() {
  if (handlersAttached) return;
  handlersAttached = true;
  document.addEventListener("mouseover", (e) => {
    if (!st.on) return;
    const el = e.target.closest(".ln .w");
    if (el) show(el, e.clientX, e.clientY);
  });
  document.addEventListener("mouseout", (e) => { if (e.target.closest(".ln .w")) queueHide(); });
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest(".ln .w");
    if (st.on && el && tip.classList.contains("show") && !st.complex) place(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("click", (e) => {
    if (!st.on) return;
    const el = e.target.closest(".ln .w");
    if (el) { e.preventDefault(); st.complex = true; show(el, e.clientX, e.clientY); }
  });
  tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  tip.addEventListener("mouseleave", queueHide);
  addEventListener("scroll", hide, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}
