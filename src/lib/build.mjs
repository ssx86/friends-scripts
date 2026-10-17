// 构建期共享：数据读取 + 台词 HTML 渲染（与客户端岛屿同一套类名/结构）
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const pad = (n) => String(n).padStart(2, "0");
export const BASE = import.meta.env.BASE_URL || "/";
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];
const SIX_RE = SIX.map((n) => [n, new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, "i")]);
export function whoClass(w) {
  if (!w) return "c-other";
  for (const [n, re] of SIX_RE) if (re.test(w)) return "c-" + n.toLowerCase();
  return "c-other";
}

const WRE = /[A-Za-z][A-Za-z'-]*/g;
function wordify(text) {
  let out = "", last = 0;
  for (const m of text.matchAll(WRE)) {
    out += esc(text.slice(last, m.index));
    out += `<span class="w" data-w="${m[0].toLowerCase()}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

export function renderScript(ep) {
  return ep.lines.map((l, idx) => {
    if (l.w === undefined) {
      const cls = /^\[Scene/i.test(l.t) ? "scene" : "note";
      return `<p class="ln ${cls}" id="L${idx}" data-i="${idx}">${esc(l.t)}</p>`;
    }
    const who = `<span class="who ${whoClass(l.w)}">${esc(l.w)}:</span> `;
    const body = typeof l.p === "string"
      ? wordify(l.p)
      : l.p.map((seg) => seg[1] ? `<span class="u">${wordify(seg[0])}</span>` : wordify(seg[0])).join(" ");
    return `<p class="ln" id="L${idx}" data-i="${idx}">${who}${body}</p>`;
  }).join("\n");
}

/* 构建期读取全部季数据 */
export function loadSeasons(root) {
  const dir = join(root, "data");
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => /^s\d+\.json$/.test(x)).sort()) {
    out.set(f, JSON.parse(readFileSync(join(dir, f), "utf8")));
  }
  return out;
}
export function allEpisodes(root) {
  const flat = [];
  for (const [, data] of loadSeasons(root)) {
    for (const ep of data.episodes) flat.push(ep);
  }
  return flat;
}
export const epUrl = (s, e) => `${BASE}ep/s${pad(s)}e${e}/`;
