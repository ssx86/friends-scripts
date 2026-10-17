// 掌握系统 v2：多账号 + N/X 统计格式 + Season 卡统计覆叠
// 框架：Preact 岛屿（React API）+ Tailwind + shadcn 风格设计令牌
import { useEffect, useState } from "preact/hooks";

const BASE = import.meta.env.BASE_URL || "/";

/* ── 账号管理 ── */
const ACCT_KEY = "fs_accounts";
const CUR_KEY = "fs_current_account";

export function getAccounts(): string[] {
  try { return JSON.parse(localStorage.getItem(ACCT_KEY) || '["default"]'); } catch { return ["default"]; }
}
export function getCurrentAccount(): string {
  return localStorage.getItem(CUR_KEY) || "default";
}
function masteredKey(): string {
  const a = getCurrentAccount();
  return a === "default" ? "fs_mastered" : `fs_mastered:${a}`;
}
export function switchAccount(name: string) {
  localStorage.setItem(CUR_KEY, name);
  if (!getAccounts().includes(name)) {
    localStorage.setItem(ACCT_KEY, JSON.stringify([...getAccounts(), name]));
  }
}
export function addAccount(name: string) { switchAccount(name); }

/* ── 数据层 ── */
let VOCAB = null;
let W2I = null;
let MASTERED = null;

export async function initMastery() {
  if (W2I && MASTERED) return;
  VOCAB = await (await fetch(`${BASE}data/vocab.json`)).json();
  W2I = new Map(VOCAB.map((v, i) => [v[0], i]));
  const raw = localStorage.getItem(masteredKey()) || "[]";
  MASTERED = new Set(JSON.parse(raw));
}

export function reloadMastery() {
  MASTERED = new Set(JSON.parse(localStorage.getItem(masteredKey()) || "[]"));
}

export const masteredCount = () => MASTERED ? MASTERED.size : 0;
export function isMasteredIdx(i) { return MASTERED.has(i); }
export function wordIdx(w) { return W2I.get(w); }

export function markWords(idxs) {
  let added = 0;
  for (const i of idxs) if (!MASTERED.has(i)) { MASTERED.add(i); added++; }
  localStorage.setItem(masteredKey(), JSON.stringify([...MASTERED]));
  return added;
}
export function resetMastery() {
  MASTERED = new Set();
  localStorage.removeItem(masteredKey());
}

/* ── 剧集页：N/X 统计 + 框 ── */
export async function applyEpisode() {
  await initMastery();
  const linesEls = [...document.querySelectorAll(".ln")];
  let pendingLines = 0;
  const remainingWords = new Set();
  const totalWords = new Set();
  let totalDialogue = 0;
  for (const el of linesEls) {
    const words = [...el.querySelectorAll(".w")];
    if (!words.length) continue;
    totalDialogue++;
    const un = new Set();
    for (const w of words) {
      const i = W2I.get(w.dataset.w);
      if (i === undefined) continue;
      totalWords.add(i);
      if (!MASTERED.has(i)) un.add(i);
    }
    if (un.size) {
      el.classList.add("pending");
      pendingLines++;
      un.forEach((i) => remainingWords.add(i));
    } else {
      el.classList.remove("pending");
    }
  }
  const head = document.querySelector(".ep-head");
  if (head) {
    let stat = document.getElementById("ep-mastery");
    if (!stat) { stat = document.createElement("div"); stat.id = "ep-mastery"; stat.className = "mstat"; head.appendChild(stat); }
    const wPct = totalWords.size ? Math.round((1 - remainingWords.size / totalWords.size) * 100) : 100;
    const sPct = totalDialogue ? Math.round((1 - pendingLines / totalDialogue) * 100) : 100;
    stat.innerHTML = `
      <div class="mstat-bar-wrap">
        <div class="mstat-bar"><div class="mstat-fill" style="width:${sPct}%"></div></div>
        <span class="mstat-pct">${sPct}%</span>
      </div>
      <div class="mstat-detail">
        ${pendingLines
          ? `词 <b>${totalWords.size - remainingWords.size}</b>/<b>${totalWords.size}</b> (${wPct}%) · 句 <b>${totalDialogue - pendingLines}</b>/<b>${totalDialogue}</b> (${sPct}%) · 剩 <b>${remainingWords.size}</b> 词 <b>${pendingLines}</b> 句`
          : `✓ 全部掌握（${totalWords.size} 词 · ${totalDialogue} 句）`}
        <span class="mstat-hint"> · ${getCurrentAccount()}</span>
      </div>`;
  }
  return { pendingLines, remainingWords: remainingWords.size, totalWords: totalWords.size, totalDialogue };
}

/* ── 句前确认按钮（原地变色 + 通知栏） ── */
let toastEl = null, toastTimer = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "notify-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<span class="nt-icon">✨</span>${msg}`;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4000);
}

export function bindLineButtons(onChange) {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".lnok");
    if (!btn) return;
    e.preventDefault();
    if (btn.classList.contains("arm")) {
      btn.classList.remove("arm");
      const line = btn.closest(".ln");
      const idxs = new Set();
      for (const w of line.querySelectorAll(".w")) {
        const i = W2I.get(w.dataset.w);
        if (i !== undefined) idxs.add(i);
      }
      // 标记前的本集剩余
      const beforeLines = document.querySelectorAll(".ln.pending").length;
      const newWords = markWords(idxs);
      applyEpisode().then(async (stats) => {
        if (onChange) onChange();
        // 本集消灭的句子数 = 之前带框的 - 现在带框的（含全局联动消掉的）
        const afterLines = document.querySelectorAll(".ln.pending").length;
        const killedLines = beforeLines - afterLines;
        // 全局统计（10 季总进度）
        const g = await globalStats();
        const gPct = g.total ? Math.round((g.done / g.total) * 100) : 0;
        showToast(`标记 ${newWords} 词 · 消灭 ${killedLines} 句 · 全站 ${g.done}/${g.total} 句 (${gPct}%)`);
      });
    } else {
      document.querySelectorAll(".lnok.arm").forEach((b) => b.classList.remove("arm"));
      btn.classList.add("arm");
      setTimeout(() => btn.classList.remove("arm"), 3000);
    }
  });
}

/* ── 首页全局统计 + Season 卡覆叠 ── */
const LV_ORDER = ["", "common", "cet4", "cet6", "ky", "ielts", "toefl", "gre"];
const LV_NAME = { "": "超高频", common: "常用", cet4: "CET-4", cet6: "CET-6", ky: "考研", ielts: "雅思", toefl: "TOEFL", gre: "GRE" };
export function levelName(k) { return LV_NAME[k] || k; }
export const levelOrder = LV_ORDER;

export async function globalStats() {
  await initMastery();
  const { lines } = await (await fetch(`${BASE}data/lines.json`)).json();
  const per = {}; LV_ORDER.forEach((k) => per[k] = 0);
  const unWords = new Set();
  let done = 0, total = 0;
  for (const idxs of lines) {
    if (!idxs.length) continue;
    total++;
    let top = -1;
    for (const i of idxs) {
      if (MASTERED.has(i)) continue;
      unWords.add(i);
      const lv = VOCAB[i][2] || "";
      const r = LV_ORDER.indexOf(lv);
      if (r > top) top = r;
    }
    if (top < 0) done++;
    else per[LV_ORDER[top]]++;
  }
  return { per, unWords: unWords.size, done, total, totalVocab: VOCAB.length };
}

/* Season 卡统计覆叠：从 season-stats.json + lines.json 计算每季待学 */
export async function applySeasonStats() {
  await initMastery();
  const [ss, ld] = await Promise.all([
    fetch(`${BASE}data/season-stats.json`).then((r) => r.json()),
    fetch(`${BASE}data/lines.json`).then((r) => r.json()),
  ]);
  // lines.json 按 season→episode→line 顺序展开
  const epIdx = new Map();  // s → [{start,n}]
  let li = 0;
  for (const ep of ld.eps) {
    if (!epIdx.has(ep.s)) epIdx.set(ep.s, []);
    epIdx.get(ep.s).push(ep);
  }
  const cards = document.querySelectorAll("#season-grid .sg");
  cards.forEach((card) => {
    const s = parseInt(card.querySelector("b").textContent.replace("Season ", ""));
    const meta = ss[s];
    if (!meta) return;
    // 计算该季已掌握句数
    const eps = epIdx.get(s) || [];
    let done = 0, total = 0;
    const unW = new Set();
    for (const ep of eps) {
      for (let k = ep.start; k < ep.start + ep.n; k++) {
        const idxs = ld.lines[k];
        if (!idxs || !idxs.length) continue;
        total++;
        let all = true;
        for (const i of idxs) {
          if (!MASTERED.has(i)) { all = false; unW.add(i); }
        }
        if (all) done++;
      }
    }
    const unWords = unW.size;
    const tt = card.querySelector(".tt");
    if (!tt) return;
    let chip = tt.querySelector(".sg-stat");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "sg-stat";
      tt.appendChild(chip);
    }
    const pct = total ? Math.round((done / total) * 100) : 0;
    chip.innerHTML = done === total
      ? `<span class="sg-done">✓ 全掌握</span>`
      : `<div class="sg-bar"><div class="sg-bar-fill" style="width:${pct}%"></div></div><span class="sg-rem">${pct}% · 剩 ${unWords}/${meta.words} 词 · ${total - done}/${total} 句</span>`;
  });
}

/* ── 账号切换 UI（shadcn 风格 Drop-down） ── */
export function AccountSwitcher() {
  const [accounts, setAccounts] = useState(getAccounts());
  const [current, setCurrent] = useState(getCurrentAccount());
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const doSwitch = (name) => {
    switchAccount(name);
    setCurrent(name);
    setAccounts(getAccounts());
    reloadMastery();
    location.reload();  // 全页刷新重算所有统计
  };

  const doAdd = () => {
    const name = newName.trim() || `user${accounts.length + 1}`;
    if (!accounts.includes(name)) doSwitch(name);
    setNewName("");
  };

  return (
    <div class="acct-wrap" onClick={(e) => e.stopPropagation()}>
      <button class="acct-btn" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
        {current}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={`transform:rotate(${open ? 180 : 0}deg);transition:.2s`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div class="acct-menu">
          {accounts.map((a) => (
            <button key={a} class={`acct-item${a === current ? " active" : ""}`} onClick={() => doSwitch(a)}>
              {a === current ? "✓ " : ""}{a}
            </button>
          ))}
          <div class="acct-add">
            <input type="text" placeholder="新账号名…" value={newName}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && doAdd()} />
            <button onClick={doAdd}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
