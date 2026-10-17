/* ── 专注模式 v3：纯文本句子 + 滑块 + 翻页（无查词） ── */
import { wordIdx, markWords, applyEpisode } from "./mastery.tsx";
import { esc } from "./tip.ts";

let focusOverlay = null;
let focusLines = [];
let focusIdx = 0;

export function startFocusMode() {
  const lines = [...document.querySelectorAll(".ln")].filter((l) => l.querySelector(".who"));
  if (!lines.length) return;
  focusLines = lines;
  focusIdx = 0;
  bindFocusKeys();
  renderFocus();
}

function getLineData(line) {
  const whoEl = line.querySelector(".who");
  const who = whoEl ? whoEl.textContent.replace(/:\s*$/, "") : "";
  const whoCls = whoEl ? whoEl.className.replace("who ", "") : "";
  // 纯文本：取 who 后面的所有文本内容
  let text = line.textContent || "";
  if (whoEl) text = text.replace(whoEl.textContent, "").replace(/^✓/, "").trim();
  else text = text.replace(/^✓/, "").trim();
  return { who, whoCls, text, isPending: line.classList.contains("pending") };
}

function renderFocus() {
  if (focusIdx >= focusLines.length) focusIdx = focusLines.length - 1;
  if (focusIdx < 0) focusIdx = 0;
  const line = focusLines[focusIdx];
  if (!line) { endFocusMode(true); return; }
  const { who, whoCls, text, isPending } = getLineData(line);
  const progress = `${focusIdx + 1} / ${focusLines.length}`;
  const pct = Math.round(((focusIdx + 1) / focusLines.length) * 100);

  if (!focusOverlay) {
    focusOverlay = document.createElement("div");
    focusOverlay.id = "focus-mode";
    document.body.appendChild(focusOverlay);
  }

  focusOverlay.innerHTML = `
    <div class="focus-backdrop"></div>
    <div class="focus-card">
      <div class="focus-top">
        <span class="focus-progress">${progress}</span>
        <button class="focus-close" title="退出专注模式">✕</button>
      </div>
      <div class="focus-line ${isPending ? "pending" : "done"}">
        ${who ? `<span class="focus-who ${whoCls}">${esc(who)}:</span>` : ""}
        <span class="focus-text">${esc(text)}</span>
      </div>
      <div class="focus-nav">
        <button class="focus-arrow focus-prev" ${focusIdx === 0 ? "disabled" : ""} title="上一句">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <input type="range" class="focus-slider" min="1" max="${focusLines.length}" value="${focusIdx + 1}" />
        <button class="focus-arrow focus-next" ${focusIdx >= focusLines.length - 1 ? "disabled" : ""} title="下一句">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="focus-acts">
        ${isPending ? `<button class="focus-btn focus-master">✓ 我会了</button>` : `<span class="focus-done-tag">已掌握</span>`}
        <button class="focus-btn focus-skip">跳过 →</button>
      </div>
      <div class="focus-bar"><div class="focus-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  focusOverlay.classList.add("show");
  document.body.style.overflow = "hidden";

  focusOverlay.querySelector(".focus-close").addEventListener("click", () => endFocusMode(false));
  focusOverlay.querySelector(".focus-backdrop").addEventListener("click", () => endFocusMode(false));
  focusOverlay.querySelector(".focus-skip").addEventListener("click", () => { focusIdx++; renderFocus(); });
  const master = focusOverlay.querySelector(".focus-master");
  if (master) master.addEventListener("click", () => {
    const idxs = new Set();
    for (const w of line.querySelectorAll(".w")) {
      const i = wordIdx(w.dataset.w);
      if (i !== undefined) idxs.add(i);
    }
    markWords(idxs);
    applyEpisode();
    focusIdx++;
    renderFocus();
  });
  const prev = focusOverlay.querySelector(".focus-prev");
  if (prev && !prev.disabled) prev.addEventListener("click", () => { focusIdx--; renderFocus(); });
  const next = focusOverlay.querySelector(".focus-next");
  if (next && !next.disabled) next.addEventListener("click", () => { focusIdx++; renderFocus(); });
  const slider = focusOverlay.querySelector(".focus-slider");
  slider.addEventListener("change", () => { focusIdx = +slider.value - 1; renderFocus(); });
}

let keysBound = false;
function bindFocusKeys() {
  if (keysBound) return;
  keysBound = true;
  document.addEventListener("keydown", (e) => {
    if (!focusOverlay || !focusOverlay.classList.contains("show")) return;
    if (e.target.tagName === "INPUT" && e.target.type === "range") return;
    if (e.key === "ArrowLeft" && focusIdx > 0) { focusIdx--; renderFocus(); }
    if (e.key === "ArrowRight" && focusIdx < focusLines.length - 1) { focusIdx++; renderFocus(); }
    if (e.key === "Escape") endFocusMode(false);
    if (e.key === " ") { e.preventDefault(); focusIdx++; renderFocus(); }
  });
}

function endFocusMode(completed) {
  if (focusOverlay) {
    focusOverlay.classList.remove("show");
    focusOverlay.innerHTML = "";
    document.body.style.overflow = "";
  }
  if (completed) {
    const t = document.createElement("div");
    t.className = "notify-toast show";
    t.innerHTML = `<span class="nt-icon">🎉</span>专注模式完成！整集 ${focusLines.length} 句已过完`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.remove("show"), 4000);
    setTimeout(() => t.remove(), 4500);
  }
}
