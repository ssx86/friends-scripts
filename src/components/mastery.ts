// 掌握系统（客户端）：localStorage 存 vocab 序号；句子级标记 + 全局词级联动 + 统计
const BASE = import.meta.env.BASE_URL || "/";
const LS_KEY = "fs_mastered";

let VOCAB = null;            // vocab.json 数组
let W2I = null;              // word → 序号
let MASTERED = null;         // Set<序号>

export async function initMastery() {
  if (W2I) return;
  VOCAB = await (await fetch(`${BASE}data/vocab.json`)).json();
  W2I = new Map(VOCAB.map((v, i) => [v[0], i]));
  MASTERED = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
}

export const masteredCount = () => MASTERED ? MASTERED.size : 0;
export function isMasteredIdx(i) { return MASTERED.has(i); }
export function wordIdx(w) { return W2I.get(w); }

export function markWords(idxs) {
  let added = 0;
  for (const i of idxs) if (!MASTERED.has(i)) { MASTERED.add(i); added++; }
  localStorage.setItem(LS_KEY, JSON.stringify([...MASTERED]));
  return added;
}
export function resetMastery() {
  MASTERED = new Set();
  localStorage.removeItem(LS_KEY);
}

/* 剧集页：给每句挂框 + 注入统计 + 绑定确认按钮 */
export async function applyEpisode() {
  await initMastery();
  const linesEls = [...document.querySelectorAll(".ln")];
  let pendingLines = 0, remainingWords = new Set();
  for (const el of linesEls) {
    const words = [...el.querySelectorAll(".w")];
    if (!words.length) continue;
    const un = new Set();
    for (const w of words) {
      const i = W2I.get(w.dataset.w);
      if (i !== undefined && !MASTERED.has(i)) un.add(i);
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
    stat.innerHTML = pendingLines
      ? `未掌握：<b>${remainingWords.size}</b> 词 · <b>${pendingLines}</b> 句带框（点句尾 ✓ 确认两次即整句标记）`
      : `✓ 本集全部掌握`;
  }
  return { pendingLines, remainingWords: remainingWords.size };
}

/* 句尾确认按钮（事件委托）：第一次点击 = 预备（确认？），第二次 = 提交 */
export function bindLineButtons(onChange) {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".lnok");
    if (!btn) return;
    e.preventDefault();
    if (btn.classList.contains("arm")) {
      btn.classList.remove("arm");
      btn.textContent = "✓";
      const line = btn.closest(".ln");
      const idxs = new Set();
      for (const w of line.querySelectorAll(".w")) {
        const i = W2I.get(w.dataset.w);
        if (i !== undefined) idxs.add(i);
      }
      markWords(idxs);
      applyEpisode().then(() => onChange && onChange());
    } else {
      document.querySelectorAll(".lnok.arm").forEach((b) => { b.classList.remove("arm"); b.textContent = "✓"; });
      btn.classList.add("arm");
      btn.textContent = "确认？";
      setTimeout(() => { if (btn.classList.contains("arm")) { btn.classList.remove("arm"); btn.textContent = "✓"; } }, 3000);
    }
  });
}

/* 首页全局统计：按"未掌握词的最高级别"给句子归级 */
const LV_ORDER = ["", "common", "cet4", "cet6", "ky", "ielts", "toefl", "gre"];
const LV_NAME = { "": "超高频", common: "常用", cet4: "CET-4", cet6: "CET-6", ky: "考研", ielts: "雅思", toefl: "TOEFL", gre: "GRE" };

export async function globalStats() {
  await initMastery();
  const { eps, lines } = await (await fetch(`${BASE}data/lines.json`)).json();
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
  return { per, unWords: unWords.size, done, total };
}

export function levelName(k) { return LV_NAME[k] || k; }
export const levelOrder = LV_ORDER;
