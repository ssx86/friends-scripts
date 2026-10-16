// friends-scripts 数据构建脚本（零依赖）
// 用法: node scripts/build.mjs
// 解析 season/*.html → data/index.json + data/s01.json ... s10.json
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "season");
const OUT = join(ROOT, "data");
mkdirSync(OUT, { recursive: true });

const ENTITIES = {
  "&nbsp;": " ", "&#160;": " ", "&amp;": "&", "&quot;": '"',
  "&#39;": "'", "&lt;": "<", "&gt;": ">", "&copy;": "(c)", "&mdash;": "—",
  "&ndash;": "–", "&hellip;": "…", "&rsquo;": "'", "&lsquo;": "'",
  "&rdquo;": '"', "&ldquo;": '"', "&middot;": "·",
};
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
   .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);

// 台词本用 iso-8859-1 编码
const readLatin1 = (f) => readFileSync(f, "latin1");

// 标题清洗：去掉 "Friends - " / "FRIENDS - " / "1001 - " 之类前缀
function cleanTitle(t) {
  return (t || "")
    .replace(/^friends?\s*[-–—:]\s*/i, "")
    .replace(/^\d{1,4}\s*[-–—]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
function goodTitle(t) {
  const c = cleanTitle((t || "").replace(/<[^>]+>/g, ""));
  return c && !/^untitled/i.test(c) ? c : null;
}

let FALLBACK = {};
try { FALLBACK = JSON.parse(readFileSync(join(ROOT, "scripts", "titles-fallback.json"), "utf8")); } catch {}

function parseEpisode(file) {
  const html = readLatin1(join(SRC, file));
  const code = file.replace(/\.html$/, "");
  const m = code.match(/^(\d{2})(\d{2})(?:-(\d{2})(\d{2}))?(uncut)?$/);
  if (!m && file === "07outtakes.html") {
    return { s: 7, e: "OT", t: goodTitle(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) || "The Stuff You've Never Seen", lines: parseBody(html) };
  }
  if (!m) return null;
  const season = +m[1];
  const ep = m[3] ? `${+m[2]}-${+m[4]}` : +m[2];
  let title =
    goodTitle(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) ||
    goodTitle(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    cleanTitle(FALLBACK[code]) ||
    `Episode ${ep}`;
  if (m[5]) title += " (Uncut)";
  return { s: season, e: ep, t: title, lines: parseBody(html) };
}

function parseBody(html) {
  const lines = [];
  const paras = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const para of paras) {
    let inner = para.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");

    // 场景标记
    const plain = decode(inner.replace(/<[^>]+>/g, "")).trim();
    if (/^\[Scene:/i.test(plain)) {
      lines.push({ k: "scene", t: plain });
      continue;
    }

    // 对白：<b>Speaker:</b> 或 <strong>Speaker:</strong>（S1E12 起两种混用）
    const m = inner.match(/^((?:<[^>]+>)*)(<b>|<strong>|<font[^>]*><b>|<font[^>]*><strong>)([^<]{1,28}):\s*<\/(b|strong)>([\s\S]*)$/i);
    if (m) {
      const who = decode(m[3]).trim();
      const parts = tokenize(m[5]);
      lines.push({ k: "line", w: who, p: parts });
      continue;
    }

    // 其他注释（编剧、转录者、舞台指示等）
    const text = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text) lines.push({ k: "note", t: text });
  }
  return lines;
}

// 把带 <font color="#0000FF"> 的片段拆成 [text, uncut] 数组
function tokenize(html) {
  const parts = [];
  const re = /<font\s+color\s*=\s*"?#0000FF"?\s*>([\s\S]*?)<\/font>/gi;
  let last = 0, mm;
  const push = (raw, u) => {
    const text = decode(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text) parts.push(u ? [text, 1] : [text]);
  };
  while ((mm = re.exec(html))) {
    push(html.slice(last, mm.index), 0);
    push(mm[1], 1);
    last = mm.index + mm[0].length;
  }
  push(html.slice(last), 0);
  return parts.length === 1 && parts[0][1] === undefined ? parts : parts;
}

const files = readdirSync(SRC).filter((f) => /\.html$/.test(f)).sort();
const bySeason = new Map();
for (const f of files) {
  const ep = parseEpisode(f);
  if (!ep) { console.warn("skip:", f); continue; }
  if (!bySeason.has(ep.s)) bySeason.set(ep.s, []);
  const list = bySeason.get(ep.s);
  // uncut 版替换同编号普通版
  const dup = list.findIndex((x) => String(x.e) === String(ep.e));
  if (dup >= 0) {
    if (/Uncut/.test(ep.t)) list[dup] = ep;
    else if (!/Uncut/.test(list[dup].t)) list.push(ep);
  } else list.push(ep);
}

let totalLines = 0, totalWords = 0, totalEps = 0;
const index = [];
for (const [s, eps] of [...bySeason.entries()].sort((a, b) => a[0] - b[0])) {
  eps.sort((a, b) => String(a.e).localeCompare(String(b.e), undefined, { numeric: true }));
  writeFileSync(join(OUT, `s${String(s).padStart(2, "0")}.json`), JSON.stringify({ season: s, episodes: eps }));
  totalEps += eps.length;
  for (const ep of eps) {
    index.push({ s: ep.s, e: ep.e, t: ep.t });
    totalLines += ep.lines.filter((l) => l.k === "line").length;
    for (const l of ep.lines) {
      const text = l.k === "line" ? l.p.map((p) => p[0]).join("") : l.t;
      totalWords += (text.match(/[A-Za-z]+/g) || []).length;
    }
  }
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`seasons=${bySeason.size} episodes=${totalEps} dialogueLines=${totalLines} words=${totalWords}`);
