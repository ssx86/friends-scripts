// 搜索岛屿：FlexSearch 全文索引，即打即搜、容错、键盘导航
import { useEffect, useRef, useState } from "preact/hooks";
import { Index as FlexIndex } from "flexsearch";

const SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];
const SIX_RE = SIX.map((n) => [n, new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, "i")]);
function whoClass(w) {
  if (!w) return "c-other";
  for (const [n, re] of SIX_RE) if (re.test(w)) return "c-" + n.toLowerCase();
  return "c-other";
}
const pad = (n) => String(n).padStart(2, "0");

let FLEX = null, DOCS = null, building = null;
async function ensureIndex(setMsg) {
  if (FLEX) return;
  if (!building) {
    building = (async () => {
      const idx = await (await fetch("/data/index.json")).json();
      const seasons = [...new Set(idx.map((x) => x.s))].sort((a, b) => a - b);
      const docs = [];
      const flex = new FlexIndex({ tokenize: "forward", suggest: true, resolution: 9 });
      let id = 0;
      for (let n = 0; n < seasons.length; n++) {
        const data = await (await fetch(`/data/s${pad(seasons[n])}.json`)).json();
        for (const ep of data.episodes) {
          for (const l of ep.lines) {
            if (l.w === undefined) continue;
            docs.push({ ep, l: { idx: ep.lines.indexOf(l), w: l.w, t: typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join(" ") } });
            flex.add(id++, docs[docs.length - 1].l.t);
          }
        }
        setMsg && setMsg(`正在构建搜索索引… ${n + 1}/${seasons.length}`);
      }
      DOCS = docs; FLEX = flex;
    })();
  }
  await building;
}

export default function SearchIsland() {
  const [q, setQ] = useState(new URLSearchParams(location.search).get("q") || "");
  const [state, setState] = useState({ phase: q.trim().length >= 2 ? "building" : "idle" });
  const [hits, setHits] = useState(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    const onFsQ = (e) => setQ(e.detail);
    addEventListener("fs:q", onFsQ);
    return () => removeEventListener("fs:q", onFsQ);
  }, []);

  useEffect(() => {
    let alive = true;
    const query = q.trim().toLowerCase();
    if (query.length < 2) { setHits(null); setState({ phase: "idle" }); return; }
    (async () => {
      setState({ phase: "building" });
      await ensureIndex((m) => alive && setState({ phase: "building", m }));
      if (!alive) return;
      const t0 = performance.now();
      const ids = FLEX.search(query, { limit: 300, suggest: true });
      const found = ids.map((id) => DOCS[id]);
      setState({ phase: "ready", ms: Math.round(performance.now() - t0) });
      setActive(0);
      setHits(found);
    })();
    return () => { alive = false; };
  }, [q]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.id !== "q" || !hits || !hits.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter") {
        const h = hits[activeRef.current];
        if (h) location.href = `/ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`;
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [hits]);

  useEffect(() => {
    document.querySelector(".hit.on")?.scrollIntoView({ block: "nearest" });
  }, [active, hits]);

  if (q.trim().length < 2) {
    return <div class="results"><div class="rhead">输入至少 2 个字符开始搜索（支持拼错）· <kbd>/</kbd> 聚焦搜索框</div></div>;
  }
  if (state.phase === "building") {
    return <div class="results"><div class="rhead">{state.m || "正在载入全库语料…"}</div></div>;
  }
  if (!hits) return null;
  if (!hits.length) {
    return (
      <div class="results">
        <div class="rhead">“{q}” 没有命中</div>
        <div class="empty"><div class="hyd">How you doin'?</div>十年台词里都没这句——换个拼法试试？</div>
      </div>
    );
  }
  const query = q.trim().toLowerCase();
  return (
    <div class="results">
      <div class="rhead">“{q}” 命中 <b>{hits.length}{hits.length >= 300 ? "+" : ""}</b> 条台词 · {state.ms}ms · ↑↓ 选择 · Enter 跳转</div>
      {hits.map((h, i) => {
        const at = h.l.t.toLowerCase().indexOf(query);
        const before = at >= 0 ? h.l.t.slice(Math.max(0, at - 46), at) : "";
        const mid = at >= 0 ? h.l.t.slice(at, at + query.length) : h.l.t.split(/\s+/)[0];
        const after = at >= 0 ? h.l.t.slice(at + query.length, at + query.length + 70) : h.l.t.slice(0, 90);
        return (
          <a class={`hit${i === active ? " on" : ""}`} key={`${h.ep.s}-${h.ep.e}-${h.l.idx}`} href={`/ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`}>
            <div class="src">S{pad(h.ep.s)}·E{h.ep.e} — {h.ep.t}</div>
            <div class="txt"><span class={`who2 ${whoClass(h.l.w)}`}>{h.l.w}:</span> {at >= 0 ? "…" + before : ""}<mark>{mid}</mark>{after}…</div>
          </a>
        );
      })}
    </div>
  );
}
