/* ── 专注模式：逐句弹窗，自动切下一句 ── */
import { wordIdx, markWords, applyEpisode, getCurrentAccount } from "./mastery.tsx";

let focusOverlay = null;
let focusLines = [];
let focusIdx = 0;

export function startFocusMode() {
  const lines = [...document.querySelectorAll(".ln")].filter((l) => l.querySelector(".w"));
  if (!lines.length) return;
  focusLines = lines;
  focusIdx = 0;
  showFocusLine();
}

function showFocusLine() {
  if (focusIdx >= focusLines.length) { endFocusMode(true); return; }
  const line = focusLines[focusIdx];
  const who = line.querySelector(".who");
  const isPending = line.classList.contains("pending");
  const progress = `${focusIdx + 1} / ${focusLines.length}`;

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
        ${who ? `<span class="focus-who ${who.className.replace("who ", "")}">${who.textContent}</span>` : ""}
        <span class="focus-text">${line.textContent.replace(/^✓/, "").replace(who?.textContent || "", "").trim()}</span>
      </div>
      <div class="focus-acts">
        ${isPending ? `<button class="focus-btn focus-master">✓ 我会了</button>` : `<span class="focus-done-tag">已掌握</span>`}
        <button class="focus-btn focus-skip">跳过 →</button>
      </div>
      <div class="focus-bar"><div class="focus-bar-fill" style="width:${Math.round(((focusIdx + 1) / focusLines.length) * 100)}%"></div></div>
    </div>`;
  focusOverlay.classList.add("show");
  document.body.style.overflow = "hidden";

  focusOverlay.querySelector(".focus-close").addEventListener("click", () => endFocusMode(false));
  focusOverlay.querySelector(".focus-backdrop").addEventListener("click", () => endFocusMode(false));
  focusOverlay.querySelector(".focus-skip").addEventListener("click", () => { focusIdx++; showFocusLine(); });
  const masterBtn = focusOverlay.querySelector(".focus-master");
  if (masterBtn) masterBtn.addEventListener("click", () => {
    // 标记整句已会（与点 ✓ 按钮相同逻辑）
    const idxs = new Set();
    for (const w of line.querySelectorAll(".w")) {
      const i = wordIdx(w.dataset.w);
      if (i !== undefined) idxs.add(i);
    }
    markWords(idxs);
    applyEpisode();
    focusIdx++;
    showFocusLine();
  });
}

function endFocusMode(completed) {
  if (focusOverlay) {
    focusOverlay.classList.remove("show");
    focusOverlay.innerHTML = "";
    document.body.style.overflow = "";
  }
  if (completed) {
    // 触发通知
    const toast = document.querySelector(".notify-toast");
    if (toast) { toast.remove(); }
    // 用 mastery.tsx 的 showToast 如果有导出
    const t = document.createElement("div");
    t.className = "notify-toast show";
    t.innerHTML = `<span class="nt-icon">🎉</span>专注模式完成！整集 ${focusLines.length} 句已过完`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.remove("show"), 4000);
    setTimeout(() => t.remove(), 4500);
  }
}
