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
// 转录文件标注 iso-8859-1，实际是 windows-1252（0x80-0x9F 是智能引号/破折号等，
// 按 latin1 读会变成控制字符 → 页面上显示为方块），这里统一重映射
const CP1252 = {
  "\u0080": "\u20AC", "\u0082": "\u201A", "\u0083": "\u0192", "\u0084": "\u201E", "\u0085": "\u2026",
  "\u0086": "\u2020", "\u0087": "\u2021", "\u0088": "\u02C6", "\u0089": "\u2030", "\u008A": "\u0160",
  "\u008B": "\u2039", "\u008C": "\u0152", "\u008E": "\u017D", "\u0091": "\u2018", "\u0092": "\u2019",
  "\u0093": "\u201C", "\u0094": "\u201D", "\u0095": "\u2022", "\u0096": "\u2013", "\u0097": "\u2014",
  "\u0098": "\u02DC", "\u0099": "\u2122", "\u009A": "\u0161", "\u009B": "\u203A", "\u009C": "\u0153",
  "\u009E": "\u017E", "\u009F": "\u0178",
};
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
   .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
   .replace(/[\u0080-\u009F]/g, (c) => CP1252[c] ?? "");

// 台词本用 iso-8859-1 编码
const readLatin1 = (f) => readFileSync(f, "latin1");

// 标题清洗：去掉 "Friends - " / "FRIENDS - " / "1001 - " 之类前缀
function cleanTitle(t) {
  return (t || "")
    .replace(/^friends?\s*[-–—:]\s*/i, "")
    .replace(/^\d{1,4}\s*[-–—]\s*/, "")
    .replace(/^\d{1,2}\.\d{1,2}\s*[-–—]?\s*/, "")   // "10.08 The One…" 点号前缀
    .replace(/\s+/g, " ")
    .trim();
}
function goodTitle(t) {
  const c = cleanTitle((t || "").replace(/<[^>]+>/g, ""));
  if (!c || /^untitled/i.test(c) || /^friends?$/i.test(c)) return null;
  if (c === c.toUpperCase() && c.length > 10) {
    return c.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (_, p, ch) => p + ch.toUpperCase()); // 全大写标题转 Title Case
  }
  return c;
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

/* 规范化：strong→b、冒号收进标签内，统一后续匹配 */
function normalize(html) {
  return html
    .replace(/<(\/?)strong>/gi, "<$1b>")
    .replace(/(<b>)([^<]{1,28}?)(<\/b>)\s*:/g, "$1$2:$3");
}

const SPEAKER_RE = /^(?:<[^>]+>)*<b>([^<]{1,28}):\s*<\/b>([\s\S]*)$/i;
const PLAIN_RE = /^([A-Z][A-Za-z&.'\- ]{1,28}):\s+([\s\S]+)$/;

function parseBody(htmlRaw) {
  const lines = [];
  const html = normalize(htmlRaw).replace(/<head[\s\S]*?<\/head>/gi, "");
  const paras = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const chunks = paras.length >= 10
    ? paras
    : html.split(/<br\s*\/?>|\n/gi);   // <br> 分段的老文件（S9E11/E15 风格）

  for (const chunk of chunks) {
    const text = decode(chunk.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (/^\[Scene:/i.test(text)) { lines.push({ t: text }); continue; }   // t 且 [Scene 前缀 = 场景

    const m = chunk.match(SPEAKER_RE);
    if (m) {
      let who = decode(m[1]).trim();
      if (who === who.toUpperCase() && /[A-Z]{2}/.test(who)) {
        who = who.replace(/[A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase()); // RACHEL → Rachel
      }
      const parts = tokenize(m[2]);
      // 无未删续片段的单段台词直接存字符串；行 = {w,p}，省掉 "k" 类型键
      const p = parts.length === 1 && !parts[0][1] ? parts[0][0] : parts;
      lines.push({ w: who, p });
      continue;
    }
    // 纯文本说话人（S2 风格：RACHEL: ...，无任何标签）
    const pm = text.match(PLAIN_RE);
    if (pm && !/^(http|www)/i.test(pm[1])) {
      let who = pm[1].trim();
      if (who === who.toUpperCase()) who = who.replace(/[A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase());
      lines.push({ k: "line", w: who, p: [[pm[2].trim()]] });
      continue;
    }
    if (text.length > 1) lines.push({ t: text });   // t 无 [Scene 前缀 = 注释
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
    totalLines += ep.lines.filter((l) => l.w !== undefined).length;
    for (const l of ep.lines) {
      const text = l.w !== undefined ? (typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join("")) : l.t;
      totalWords += (text.match(/[A-Za-z]+/g) || []).length;
    }
  }
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`seasons=${bySeason.size} episodes=${totalEps} dialogueLines=${totalLines} words=${totalWords}`);
