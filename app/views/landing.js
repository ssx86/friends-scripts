// 首页：猫眼黄框 + 十季主题卡
import { useEffect, useState } from "preact-hooks";
import { html, esc, SEASON_DOTS, SEASON_ICONS, ICONS } from "../ui.js";
import { getIndex } from "../data.js";

export function Landing({ go }) {
  const [index, setIndex] = useState(null);
  useEffect(() => { getIndex().then(setIndex); }, []);
  if (!index) return html`<div class="landing"><div class="vsub">载入中…</div></div>`;
  const byS = new Map();
  index.forEach((it, i) => { if (!byS.has(it.s)) byS.set(it.s, i); });
  return html`<div class="landing">
    <div class="peephole"><img class="cover" src="cover.jpg" alt="Friends" /></div>
    <h1>老友记 · 台词库<small>TEN SEASONS · ALL LINES</small></h1>
    <div class="stats">
      <div class="stat"><b>228</b><span>EPISODES</span></div>
      <div class="stat"><b>61,758</b><span>DIALOGUES</span></div>
      <div class="stat"><b>873,135</b><span>WORDS</span></div>
    </div>
    <p class="hint">悬停任意单词查中英释义与词频（ECDICT）· <kbd>/</kbd> 搜索台词（支持容错）· <kbd>←</kbd><kbd>→</kbd> 上下集</p>
    <div class="season-grid" id="season-grid">
      ${[...byS.entries()].sort((a, b) => a[0] - b[0]).map(([s, i]) => html`
        <div class="sg" key=${s} onClick=${() => go(`s${index[i].s}e${index[i].e}`)}>
          <svg class="ico" viewBox="0 0 64 64" fill="none" style=${{ color: SEASON_DOTS[s - 1] }} dangerouslySetInnerHTML=${{ __html: ICONS[SEASON_ICONS[s - 1]] }} />
          <div class="tt"><b>Season ${s}</b><span>${index.filter((x) => x.s === s).length} EPISODES</span></div>
        </div>`)}
    </div>
    <p class="lyric">I'LL BE THERE FOR YOU</p>
  </div>`;
}
