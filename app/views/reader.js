// 阅读器：单集视图 + 台词渲染 + 上下集
import { useEffect, useState } from "preact-hooks";
import { html, esc, whoClass, wordify, WRE, SEASON_DOTS } from "../ui.js";
import { findEpisode, getFlat } from "../data.js";
import { tipState, onEpisodeSeason } from "../tip.js";

function renderScript(ep) {
  tipState.epCounts = {};
  return ep.lines.map((l, idx) => {
    const isLine = l.w !== undefined;   // {w,p}=台词；{t}=场景/注释（[Scene 前缀分界）
    if (!isLine) {
      const cls = /^\[Scene/i.test(l.t) ? "scene" : "note";
      return `<p class="ln ${cls}" data-i="${idx}">${esc(l.t)}</p>`;
    }
    const who = `<span class="who ${whoClass(l.w)}">${esc(l.w)}:</span> `;
    const count = (raw) => { for (const m of raw.matchAll(WRE)) tipState.epCounts[m[0].toLowerCase()] = (tipState.epCounts[m[0].toLowerCase()] || 0) + 1; };
    const body = typeof l.p === "string"
      ? (count(l.p), wordify(l.p))
      : l.p.map((seg) => (count(seg[0]), seg[1] ? `<span class="u">${wordify(seg[0])}</span>` : wordify(seg[0]))).join(" ");
    return `<p class="ln" data-i="${idx}">${who}${body}</p>`;
  }).join("\n");
}

export function Reader({ route, flat, go }) {
  const [ep, setEp] = useState(null);
  const { s, e } = route;
  useEffect(() => {
    let alive = true;
    findEpisode(s, e).then((x) => { if (alive) { setEp(x); onEpisodeSeason(s); } });
    return () => { alive = false; };
  }, [s, e]);

  const i = flat.findIndex((x) => x.s === s && String(x.e) === String(e));
  const prev = flat[i - 1], next = flat[i + 1];

  useEffect(() => {
    if (ep && route.focusLine != null) {
      const el = document.querySelector(`.ln[data-i="${route.focusLine}"]`);
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
    } else if (ep) scrollTo({ top: 0 });
  }, [ep]);

  if (!ep) return html`<div class="reader"><div class="vsub">载入中…</div></div>`;
  const goI = (n) => go(`s${flat[n].s}e${flat[n].e}`);
  const key = `s${s}e${e}`;
  return html`<div class="reader" key=${key}>
    <div class="ep-head">
      <div class="code">
        <svg viewBox="0 0 64 64" fill="none" dangerouslySetInnerHTML=${{ __html: `<path d="M14 36h24v8a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" fill="currentColor"/><path d="M38 38h4a5 5 0 0 1 0 10h-4" stroke="currentColor" stroke-width="3"/>` }} />
        EPISODE ${s} × ${e}
      </div>
      <h2>${ep.t}</h2>
    </div>
    <div class="script" dangerouslySetInnerHTML=${{ __html: renderScript(ep) }} />
    <div class="pager">
      ${prev
        ? html`<a class="pg prev" href="#${`s${prev.s}e${prev.e}`}" onClick=${(ev) => { ev.preventDefault(); goI(i - 1); }}><span>← PREV</span><b>${prev.t}</b></a>`
        : html`<span></span>`}
      ${next
        ? html`<a class="pg next" href="#${`s${next.s}e${next.e}`}" onClick=${(ev) => { ev.preventDefault(); goI(i + 1); }}><span>NEXT →</span><b>${next.t}</b></a>`
        : null}
    </div>
  </div>`;
}
