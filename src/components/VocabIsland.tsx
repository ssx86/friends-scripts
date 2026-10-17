// 单词表岛屿：级别筛选 + 出处钻取（?w= 参数化）
import { useEffect, useMemo, useState } from "preact/hooks";

const LVL_META = {
  ielts: ["雅思", "var(--c-rachel)"], ky: ["考研", "var(--c-phoebe)"], cet6: ["CET-6", "var(--c-chandler)"],
  cet4: ["CET-4", "var(--c-chandler)"], toefl: ["TOEFL", "var(--door)"], gre: ["GRE", "var(--c-ross)"],
  common: ["常用", "var(--faint)"],
};
const pad = (n) => String(n).padStart(2, "0");

const SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];
const SIX_RE = SIX.map((n) => [n, new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, "i")]);
function whoClass(w) {
  if (!w) return "c-other";
  for (const [n, re] of SIX_RE) if (re.test(w)) return "c-" + n.toLowerCase();
  return "c-other";
}

let corpusCache = null;
async function ensureCorpus(setMsg) {
  if (corpusCache) return corpusCache;
  const idx = await (await fetch("/data/index.json")).json();
  const seasons = [...new Set(idx.map((x) => x.s))].sort((a, b) => a - b);
  const parts = [];
  for (let n = 0; n < seasons.length; n++) {
    const data = await (await fetch(`/data/s${pad(seasons[n])}.json`)).json();
    for (const ep of data.episodes) {
      parts.push({ s: ep.s, e: ep.e, t: ep.t, lines: ep.lines.filter((l) => l.w !== undefined).map((l) => ({ idx: ep.lines.indexOf(l), w: l.w, t: typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join(" ") })) });
    }
    setMsg && setMsg(`正在载入全库语料… ${n + 1}/${seasons.length}`);
  }
  corpusCache = parts;
  return parts;
}

export default function VocabIsland() {
  const [vocab, setVocab] = useState(null);
  const [w, setW] = useState(new URLSearchParams(location.search).get("w") || "");
  useEffect(() => { fetch("/data/vocab.json").then((r) => r.json()).then(setVocab); }, []);
  useEffect(() => {
    const onPop = () => setW(new URLSearchParams(location.search).get("w") || "");
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  if (!vocab) return <div class="vocab"><div class="vsub">词表载入中…</div></div>;
  return w ? <Drill w={w} vocab={vocab} onBack={() => { setW(""); history.replaceState(null, "", "/vocab/"); }} /> : <List vocab={vocab} onPick={(word) => { setW(word); history.replaceState(null, "", "/vocab/?w=" + encodeURIComponent(word)); }} />;
}

function List({ vocab, onPick }) {
  const [lv, setLv] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(200);
  const counts = useMemo(() => {
    const c = { all: vocab.length, basic: 0 };
    for (const [, , l] of vocab) { c[l] = (c[l] || 0) + 1; if (l === "") c.basic++; }
    return c;
  }, [vocab]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return vocab
      .filter(([, , l]) => lv === "all" ? true : lv === "basic" ? l === "" : l === lv)
      .filter(([word, , , g]) => !ql || word.includes(ql) || (g || "").toLowerCase().includes(ql));
  }, [vocab, lv, q]);
  const rows = filtered.slice(0, shown);
  const tabs = [["all", ["全部", "var(--accent)"]], ...Object.entries(LVL_META), ["basic", ["超高频", "var(--faint)"]]];
  return (
    <div class="vocab">
      <div class="vhead"><h2>单词表<i>VOCABULARY</i></h2></div>
      <div class="vsub">按全库出现次数倒序 · 点击单词查看每一处出处并跳转 · 共 {counts.all} 个学习词（出现 ≥ 2 次）</div>
      <div class="vtabs">
        {tabs.map(([k, [label, color]]) => (
          <span class={`vtab${k === lv ? " on" : ""}`} style={k === lv ? `background:${color};border-color:${color}` : ""} onClick={() => { setLv(k); setShown(200); }}>
            {label}<span class="n">{counts[k] || 0}</span>
          </span>
        ))}
      </div>
      <input class="vsearch" type="text" placeholder="筛选单词或释义…" value={q} onInput={(e) => { setQ(e.currentTarget.value); setShown(200); }} autocomplete="off" />
      {rows.map(([word, c, l, g], i) => (
        <div class="vrow" data-w={word} key={word + i} onClick={() => onPick(word)}>
          <span class="rank">#{i + 1}</span>
          <span class="word">{word}</span>
          <span class="gloss">{g || ""}</span>
          <span class="cnt"><b>{c}</b> 次{l ? <> · <span style={`color:${LVL_META[l][1]}`}>{LVL_META[l][0]}</span></> : null}</span>
        </div>
      ))}
      {filtered.length > shown ? <button class="vmore" onClick={() => setShown(shown + 200)}>加载更多（{filtered.length - shown} 剩余）</button> : null}
    </div>
  );
}

function Drill({ w, vocab, onBack }) {
  const [occ, setOcc] = useState(null);
  const [msg, setMsg] = useState("正在载入全库语料…");
  const gloss = (vocab.find(([x]) => x === w) || [])[3] || "";
  useEffect(() => {
    let alive = true;
    ensureCorpus(setMsg).then((corpus) => {
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
    });
    return () => { alive = false; };
  }, [w]);
  if (occ === null) return <div class="occs"><div class="vsub">{msg}</div></div>;
  return (
    <div class="occs">
      <div class="ob">
        <h2>{w}</h2>
        <span class="ph">{gloss ? gloss.slice(0, 40) + " ·" : ""} {occ.length}{occ.length >= 100 ? "+" : ""} 处出处</span>
        <span class="back" onClick={onBack}>← 返回词表</span>
      </div>
      {occ.map(({ ep, l }) => {
        const at = l.t.toLowerCase().indexOf(w);
        const before = at >= 0 ? l.t.slice(Math.max(0, at - 40), at) : "";
        const mid = at >= 0 ? l.t.slice(at, at + w.length) : l.w;
        const after = at >= 0 ? l.t.slice(at + w.length, at + w.length + 64) : l.t.slice(0, 88);
        return (
          <a class="occ" key={`${ep.s}-${ep.e}-${l.idx}`} href={`/ep/s${pad(ep.s)}e${ep.e}/#L${l.idx}`}>
            <div class="src">S{pad(ep.s)}·E{ep.e} — {ep.t} · 第 {l.idx + 1} 句</div>
            <div class="txt"><span class={`who2 ${whoClass(l.w)}`}>{l.w}:</span> {at >= 0 ? "…" + before : ""}<mark>{mid}</mark>{after}…</div>
          </a>
        );
      })}
    </div>
  );
}
