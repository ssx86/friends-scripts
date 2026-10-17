// ECDICT 悬浮词典：双模式面板（简单/复杂），按季词库懒加载 + 季节守卫
import { fetchDictSlice } from "./data.js";
import { esc, whoClass } from "./ui.js";

export const tipState = {
  on: localStorage.getItem("fs_dict") !== "0",
  DICT: null, season: 0, fetching: null,
  word: null, display: "", complex: false,
  epCounts: {}, lastX: 0, lastY: 0,
};

let tip = null, hideTimer = null;
export function initTip() {
  tip = document.createElement("div");
  tip.id = "tip";
  document.body.appendChild(tip);
  applyDictOn();
}
export function applyDictOn() { document.body.classList.toggle("dict-on", tipState.on); }

/* 换集：立即作废旧季词典，2.5s 后预取（不与剧集 JSON 抢带宽） */
export function onEpisodeSeason(s) {
  if (tipState.season !== s) { tipState.season = s; tipState.DICT = null; tipState.fetching = null; }
  setTimeout(() => { if (tipState.season === s) prefetchDict(s); }, 2500);
}
function prefetchDict(s) {
  if (tipState.season === s && tipState.DICT) return;
  tipState.season = s; tipState.DICT = null;
  tipState.fetching = fetchDictSlice(s).then((j) => {
    if (tipState.season === s) tipState.DICT = j;
    if (tip.classList.contains("show") && tipState.word) { renderTip(tipState.word); placeTip(tipState.lastX, tipState.lastY); }
  }).finally(() => { if (tipState.season === s) tipState.fetching = null; });
}

const TAGS = { cet4: "CET-4", cet6: "CET-6", ky: "考研", ielts: "雅思", toefl: "TOEFL", gre: "GRE" };
const EX_LABEL = { p: "过去式", d: "过去分词", i: "现在分词", "3": "三单", r: "比较级", t: "最高级", s: "原型", "0": "原形", "1": "变体" };

export function lookup(w) {
  if (!tipState.DICT) return null;
  let e = tipState.DICT.d[w], lemmaBadge = "";
  if (!e && tipState.DICT.l[w]) { const [base, rel] = tipState.DICT.l[w]; e = tipState.DICT.d[base]; if (e) lemmaBadge = `${base} · ${rel}`; }
  if (!e && /'s$/.test(w)) { const b = w.replace(/'s$/, ""); e = tipState.DICT.d[b]; if (e) lemmaBadge = `${b} · 所有格`; }
  return e ? { e, lemmaBadge } : null;
}

function rankBar(label, rank) {
  if (!rank) return "";
  const pct = Math.max(4, Math.round(100 * (1 - Math.log10(rank) / 5.7)));
  return `<div class="bar"><span>${label}</span><span class="rail"><span class="fill" style="width:${pct}%"></span></span><span>#${rank}</span></div>`;
}

export function renderTip(w) {
  const hit = lookup(w);
  if (!hit) { hideTip(); return; }
  const [ph, def, tr, pos, collins, oxford, tag, bnc, frq, ex] = hit.e;
  const trLines = tr.split("\n").filter(Boolean);
  const defLines = def.split("\n").filter(Boolean);
  const chips = [];
  if (hit.lemmaBadge) chips.push(`<span class="chip door">${esc(hit.lemmaBadge)}</span>`);
  const frqTop = frq > 0 && frq <= 5000;   // COCA 前 5000：超高频初学词，不标考试/星级
  if (collins && !frqTop) chips.push(`<span class="chip yellow">${"★".repeat(Math.min(collins, 5))}</span>`);
  if (oxford && !frqTop) chips.push(`<span class="chip yellow">牛津3000</span>`);
  for (const t of tag.split(" ")) if (TAGS[t] && !frqTop) chips.push(`<span class="chip">${TAGS[t]}</span>`);
  const lvlChips = [];
  if (bnc && !frqTop) lvlChips.push(`<span class="chip lvl">BNC ${bnc}</span>`);
  if (frq && !frqTop) lvlChips.push(`<span class="chip lvl">COCA ${frq}</span>`);
  const forms = ex.split("/").filter(Boolean).map((p) => {
    const c = p.indexOf(":");
    return c < 1 ? null : { k: p.slice(0, c), v: p.slice(c + 1) };
  }).filter((f) => f && EX_LABEL[f.k]);

  tip.classList.toggle("complex", tipState.complex);
  tip.innerHTML = `
    <button class="x" title="收起">✕</button>
    <div class="tw"><b>${esc(tipState.display)}</b>${ph ? `<span class="ph">/${esc(ph)}/</span>` : ""}</div>
    ${chips.length || lvlChips.length ? `<div class="chips">${chips.join("")}${tipState.complex ? lvlChips.join("") : ""}</div>` : ""}
    ${trLines.length ? `<div class="tr"><span class="first">${esc(trLines[0])}</span>${tipState.complex && trLines.length > 1 ? `\n<span class="rest">${esc(trLines.slice(1).join("\n"))}</span>` : ""}</div>` : ""}
    ${tipState.complex && defLines.length ? `<div class="en">${esc(defLines.join("\n"))}</div>` : ""}
    ${tipState.complex && forms.length ? `<div class="sec"><div class="sh">WORD&nbsp;FORMS&nbsp;·&nbsp;变形</div><div class="forms">
      ${forms.map((f) => `<span class="fchip" data-lw="${esc(f.v)}"><i>${EX_LABEL[f.k]}</i>${esc(f.v)}</span>`).join("")}
    </div></div>` : ""}
    ${tipState.complex && (bnc || frq) ? `<div class="sec"><div class="sh">FREQUENCY&nbsp;·&nbsp;词频</div><div class="bars">${rankBar("BNC", bnc)}${rankBar("COCA", frq)}</div></div>` : ""}
    ${tipState.complex ? `<div class="sec cross"><span class="cnt">本集出现 <b>${tipState.epCounts[w] || 1}</b> 次</span><a id="tip-search">在台词中搜索 →</a></div>` : ""}
    <button class="expand">${tipState.complex ? "收起 ▴" : "展开全部 ▾"}</button>`;
  tip.querySelector(".x").addEventListener("click", hideTip);
  tip.querySelector(".expand").addEventListener("click", () => {
    tipState.complex = !tipState.complex;
    renderTip(w);
    placeTip(tipState.lastX, tipState.lastY);
  });
  tip.querySelectorAll(".fchip").forEach((el) => el.addEventListener("click", () => {
    const nw = el.dataset.lw;
    if (lookup(nw)) { tipState.word = nw; tipState.display = nw; tipState.complex = true; renderTip(nw); placeTip(tipState.lastX, tipState.lastY); }
    else el.style.opacity = .4;
  }));
  const ts = tip.querySelector("#tip-search");
  if (ts) ts.addEventListener("click", () => {
    const q = document.getElementById("q");
    q.value = w;
    q.dispatchEvent(new Event("input", { bubbles: true }));
    hideTip();
  });
}

export function showTip(el, x, y) {
  clearTimeout(hideTimer);
  tipState.word = el.dataset.w;
  tipState.display = el.textContent;
  if (!tipState.DICT) {
    if (tipState.season > 0) prefetchDict(tipState.season);
    if (!tipState.fetching) { hideTip(); return; }
    tip.classList.remove("complex");
    tip.innerHTML = `<div class="loading">词库载入中…（随本集预取，仅首次）</div>`;
    placeTip(x, y);
    return;
  }
  renderTip(tipState.word);
  placeTip(x, y);
}
export function placeTip(x, y) {
  tipState.lastX = x; tipState.lastY = y;
  tip.classList.add("show");
  const r = tip.getBoundingClientRect();
  let tx = x + 16, ty = y + 18;
  if (tx + r.width > innerWidth - 12) tx = x - r.width - 14;
  if (ty + r.height > innerHeight - 12) ty = Math.max(10, y - r.height - 14);
  tip.style.left = Math.max(10, tx) + "px";
  tip.style.top = ty + "px";
}
export function hideTip() { clearTimeout(hideTimer); tip.classList.remove("show"); tipState.complex = false; }
export function queueHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideTip, 260); }

/* 事件委托：挂在根容器（视图切换后依然有效） */
export function attachTipHandlers(root, onSearchWord) {
  root.addEventListener("mouseover", (e) => {
    if (!tipState.on) return;
    const el = e.target.closest(".ln .w");
    if (el) showTip(el, e.clientX, e.clientY);
  });
  root.addEventListener("mouseout", (e) => { if (e.target.closest(".ln .w")) queueHide(); });
  root.addEventListener("mousemove", (e) => {
    const el = e.target.closest(".ln .w");
    if (tipState.on && el && tip.classList.contains("show") && !tipState.complex) placeTip(e.clientX, e.clientY);
  }, { passive: true });
  root.addEventListener("click", (e) => {
    if (!tipState.on) return;
    const el = e.target.closest(".ln .w");
    if (el) { e.preventDefault(); tipState.complex = true; showTip(el, e.clientX, e.clientY); }
  });
  tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  tip.addEventListener("mouseleave", queueHide);
  addEventListener("scroll", hideTip, { passive: true });
}
