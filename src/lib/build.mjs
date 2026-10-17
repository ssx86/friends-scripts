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

const WRE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;   // 纯字母+可选省略号（don't → don't），不含连字符（well-known → well + known）

/* ── 词级分类（构建期烘焙）：简单词(中考/高考/超高频)无下划线；难且高频(≥10次且无中考四六级标签)金色 ── */
let CLASSIFY = null;
function loadClassify() {
  if (CLASSIFY) return CLASSIFY;
  CLASSIFY = new Map();
  const vocab = JSON.parse(readFileSync(join(root, "data", "vocab.json"), "utf8"));
  const counts = new Map(vocab.map((v) => [v[0], v[1]]));
  try {
    for (const f of readdirSync(join(root, "data", "dict"))) {
      const j = JSON.parse(readFileSync(join(root, "data", "dict", f), "utf8"));
      for (const [w, e] of Object.entries(j.d)) {
        if (CLASSIFY.has(w)) continue;
        const tags = new Set(String(e[6] || "").split(" "));
        const frq = e[8] || 0;
        const simpleHit = tags.has("zk") || tags.has("gk") || tags.has("cet4") || tags.has("cet6") || (frq > 0 && frq <= 4000);
        if (simpleHit) CLASSIFY.set(w, "simple");
        else if (frq > 4000) CLASSIFY.set(w, "hard");   // 难词 = COCA 排名 4000 以外（用户规则：无次数门槛）
      }
      // 变形共享原形分类
      for (const [form, [base]] of Object.entries(j.l)) {
        if (!CLASSIFY.has(form) && CLASSIFY.get(base) === "simple") CLASSIFY.set(form, "simple");
      }
    }
  } catch { /* dict 不存在时退化为无分类 */ }
  // 第二遍：变形词永不判 hard（哪怕有独立词条），原形 simple 则变形 simple
  const inflect = new Map();   // 变形 -> 原形（来自词条 exchange + l 表）
  for (const f of readdirSync(join(root, "data", "dict"))) {
    const j = JSON.parse(readFileSync(join(root, "data", "dict", f), "utf8"));
    for (const [w, e] of Object.entries(j.d)) {
      const ex = String(e[9] || "");
      for (const part of ex.split("/")) {
        const c = part.indexOf(":");
        if (c > 0 && /^[pdi3rt]$/.test(part.slice(0, c))) {
          const form = part.slice(c + 1).toLowerCase();
          if (form && !inflect.has(form)) inflect.set(form, w);
        }
      }
    }
    for (const [form, [base]] of Object.entries(j.l)) if (!inflect.has(form)) inflect.set(form, base);
  }
  for (const [form, base] of inflect) {
    if (CLASSIFY.get(base) === "simple") CLASSIFY.set(form, "simple");
    else if (CLASSIFY.get(form) === "hard") CLASSIFY.delete(form);
  }
  return CLASSIFY;
}
let root = "";
function wordify(text) {
  const cls = loadClassify();
  let out = "", last = 0;
  for (const m of text.matchAll(WRE)) {
    const w = m[0].toLowerCase();
    const c = cls.get(w);
    out += esc(text.slice(last, m.index));
    out += `<span class="w${c ? " " + c : ""}" data-w="${w}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

export function renderScript(ep, repoRoot = process.cwd()) { root = repoRoot;
  return ep.lines.map((l, idx) => {
    if (l.w === undefined) {
      const cls = /^\[Scene/i.test(l.t) ? "scene" : "note";
      return `<p class="ln ${cls}" id="L${idx}" data-i="${idx}">${esc(l.t)}</p>`;
    }
    const who = `<span class="who ${whoClass(l.w)}">${esc(l.w)}:</span> `;
    const body = typeof l.p === "string"
      ? wordify(l.p)
      : l.p.map((seg) => seg[1] ? `<span class="u">${wordify(seg[0])}</span>` : wordify(seg[0])).join(" ");
    return `<p class="ln" id="L${idx}" data-i="${idx}"><button class="lnok" title="标记本句全部单词已会">✓</button>${who}${body}</p>`;
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
