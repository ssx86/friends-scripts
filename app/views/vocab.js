// 单词表：级别分页 + 筛选 + 出处钻取（#/word/:w 可分享）
import { useEffect, useState } from "preact-hooks";
import { html, esc, whoClass, LVL_META } from "../ui.js";
import { getVocab, ensureCorpus, getFlat } from "../data.js";

export function Vocab({ go }) {
  const [vocab, setVocab] = useState(null);
  const [lv, setLv] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(200);
  useEffect(() => { getVocab().then(setVocab); }, []);
  if (!vocab) return html`<div class="vocab"><div class="vsub">词表载入中…</div></div>`;

  const counts = { all: vocab.length, basic: 0 };
  for (const [, , l] of vocab) { counts[l] = (counts[l] || 0) + 1; if (l === "") counts.basic++; }
  const ql = q.trim().toLowerCase();
  const filtered = vocab
    .filter(([, , l]) => lv === "all" ? true : lv === "basic" ? l === "" : l === lv)
    .filter(([w, , , g]) => !ql || w.includes(ql) || (g || "").toLowerCase().includes(ql));
  const total = filtered.length;
  const rows = filtered.slice(0, shown);

  const tabs = [["all", ["全部", "var(--accent)"]], ...Object.entries(LVL_META), ["basic", ["超高频", "var(--faint)"]]];
  return html`<div class="vocab">
    <div class="vhead"><h2>单词表<i>VOCABULARY</i></h2></div>
    <div class="vsub">按全库出现次数倒序 · 点击单词查看每一处出处并跳转 · 共 ${counts.all} 个学习词（出现 ≥ 2 次）</div>
    <div class="vtabs">
      ${tabs.map(([k, [label, color]]) => html`
        <span class="vtab${k === lv ? " on" : ""}" key=${k} style=${k === lv ? { background: color, borderColor: color } : {}} onClick=${() => { setLv(k); setShown(200); }}>
          ${label}<span class="n">${counts[k] || 0}</span>
        </span>`)}
    </div>
    <input class="vsearch" type="text" placeholder="筛选单词或释义…" value=${q}
      onInput=${(e) => { setQ(e.target.value); setShown(200); }} autocomplete="off" />
    ${rows.map(([w, c, l, g], i) => html`
      <div class="vrow" data-w=${w} key=${w + i} onClick=${() => go(`word/${encodeURIComponent(w)}`)}>
        <span class="rank">#${i + 1}</span>
        <span class="word">${w}</span>
        <span class="gloss">${g || ""}</span>
        <span class="cnt"><b>${c}</b> 次${l ? html` · <span style=${{ color: LVL_META[l][1] }}>${LVL_META[l][0]}</span>` : null}</span>
      </div>`)}
    ${total > shown ? html`<button class="vmore" onClick=${() => setShown(shown + 200)}>加载更多（${total - shown} 剩余）</button>` : null}
  </div>`;
}

export function WordDrill({ route, go }) {
  const w = decodeURIComponent(route.word);
  const [occ, setOcc] = useState(null);
  const [gloss, setGloss] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const vocab = await getVocab();
      const hit = vocab.find(([x]) => x === w);
      if (!alive) return;
      setGloss(hit ? hit[3] : "");
      const corpus = await ensureCorpus();
      if (!alive) return;
      const re = new RegExp(`(^|[^A-Za-z'])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})([^A-Za-z']|$)`, "i");
      const found = [];
      outer:
      for (const ep of corpus) {
        for (const l of ep.lines) {
          if (re.test(l.w + " " + l.t)) { found.push({ ep, l }); if (found.length >= 100) break outer; }
        }
      }
      setOcc(found);
    })();
    return () => { alive = false; };
  }, [w]);

  if (occ === null) return html`<div class="occs"><div class="vsub">正在载入全库语料…</div></div>`;
  const flat = null; // jump 由 go 处理
  const jump = async (s, e, li) => {
    go(`s${s}e${e}`, { focusLine: li });
  };
  return html`<div class="occs">
    <div class="ob">
      <h2>${w}</h2>
      <span class="ph">${gloss ? esc(gloss.slice(0, 40)) + " ·" : ""} ${occ.length}${occ.length >= 100 ? "+" : ""} 处出处</span>
      <span class="back" onClick=${() => go("vocab")}>← 返回词表</span>
    </div>
    ${occ.map(({ ep, l }) => {
      const at = l.t.toLowerCase().indexOf(w);
      const before = at >= 0 ? l.t.slice(Math.max(0, at - 40), at) : "";
      const mid = at >= 0 ? l.t.slice(at, at + w.length) : l.w;
      const after = at >= 0 ? l.t.slice(at + w.length, at + w.length + 64) : l.t.slice(0, 88);
      return html`<div class="occ" key=${ep.s + "-" + ep.e + "-" + l.idx} onClick=${() => jump(ep.s, ep.e, l.idx)}>
        <div class="src">S${String(ep.s).padStart(2, "0")}·E${ep.e} — ${ep.t} · 第 ${l.idx + 1} 句</div>
        <div class="txt"><span class="who2 ${whoClass(l.w)}">${l.w}:</span> ${at >= 0 ? "…" + before : ""}<mark>${mid}</mark>${after}…</div>
      </div>`;
    })}
  </div>`;
}
