// 搜索：FlexSearch 全文索引 —— 即打即搜、容错（suggest）、键盘导航
import { useEffect, useMemo, useRef, useState } from "preact-hooks";
import { Index as FlexSearchIndex } from "flexsearch";
import { html, esc, whoClass } from "./ui.js";
import { ensureCorpus } from "./data.js";

let FLEX = null, DOCS = null, building = null;
async function ensureIndex(setProgress) {
  if (FLEX) return;
  if (!building) {
    building = (async () => {
      const corpus = await ensureCorpus((n, t) => setProgress && setProgress(`正在载入全库语料… ${n}/${t}`));
      const docs = [];
      const flex = new FlexSearchIndex({ tokenize: "forward", suggest: true, resolution: 9 });
      let id = 0;
      for (const ep of corpus) {
        for (const l of ep.lines) {
          docs.push({ ep, l });
          flex.add(id++, l.t);
        }
      }
      DOCS = docs; FLEX = flex;
    })();
  }
  await building;
}

export function SearchResults({ query, go }) {
  const [state, setState] = useState({ phase: "idle" });   // idle | building | ready
  const [hits, setHits] = useState(null);
  const [active, setActive] = useState(0);
  const [, force] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    let alive = true;
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setHits(null); return; }
    (async () => {
      setState({ phase: "building" });
      await ensureIndex((p) => alive && setState({ phase: "building", p }));
      if (!alive) return;
      const t0 = performance.now();
      const ids = FLEX.search(q, { limit: 300, suggest: true });
      const ms = Math.round(performance.now() - t0);
      const found = ids.map((id) => DOCS[id]);
      setState({ phase: "ready", ms, n: found.length });
      setActive(0);
      setHits(found);
    })();
    return () => { alive = false; };
  }, [query]);

  /* 键盘 ↑↓ Enter（输入框获得焦点时生效，全局监听） */
  useEffect(() => {
    const onKey = (e) => {
      if (!hits || !hits.length) return;
      if (e.target.id !== "q") return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); force(Date.now()); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); force(Date.now()); }
      if (e.key === "Enter") { const h = hits[activeRef.current]; if (h) go(`s${h.ep.s}e${h.ep.e}`, { focusLine: h.l.idx }); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [hits]);

  useEffect(() => {
    const el = document.querySelector(".hit.on");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, hits]);

  if (query.trim().length < 2) return null;
  if (state.phase === "building") {
    return html`<div class="results"><div class="rhead">${state.p || "正在构建搜索索引…"}</div></div>`;
  }
  if (!hits) return null;
  if (!hits.length) {
    return html`<div class="results">
      <div class="rhead">“${query}” 没有命中</div>
      <div class="empty"><div class="hyd">How you doin'?</div>十年台词里都没这句——换个拼法试试？</div>
    </div>`;
  }
  const q = query.trim().toLowerCase();
  return html`<div class="results">
    <div class="rhead">“${query}” 命中 <b>${hits.length}${hits.length >= 300 ? "+" : ""}</b> 条台词 · ${state.ms}ms · ↑↓ 选择 · Enter 跳转 · 点击跳转</div>
    ${hits.map((h, i) => {
      const at = h.l.t.toLowerCase().indexOf(q);
      const before = at >= 0 ? h.l.t.slice(Math.max(0, at - 46), at) : "";
      const mid = at >= 0 ? h.l.t.slice(at, at + q.length) : h.l.t.split(/\s+/)[0];
      const after = at >= 0 ? h.l.t.slice(at + q.length, at + q.length + 70) : h.l.t.slice(0, 90);
      const key = `${h.ep.s}-${h.ep.e}-${h.l.idx}`;
      return html`<div class="hit${i === active ? " on" : ""}" key=${key} onClick=${() => go(`s${h.ep.s}e${h.ep.e}`, { focusLine: h.l.idx })}>
        <div class="src">S${String(h.ep.s).padStart(2, "0")}·E${h.ep.e} — ${h.ep.t}</div>
        <div class="txt"><span class="who2 ${whoClass(h.l.w)}">${h.l.w}:</span> ${at >= 0 ? "…" + before : ""}<mark>${mid}</mark>${after}…</div>
      </div>`;
    })}
  </div>`;
}
