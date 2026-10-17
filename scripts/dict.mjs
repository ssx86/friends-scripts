// ECDICT → 分季词典构建（零运行时依赖；构建期用 wink-lemmatizer 做词形还原）
// 用法: node scripts/build.mjs && node scripts/dict.mjs
// 输入: ecdict.csv（skywind3000/ECDICT 全量 77 万词条）+ data/s*.json
// 输出: data/dict/sXX.json = { d: { word: [音标,英文释义,中文释义,词性,collins,oxford,tag,bnc,frq,exchange] }, l: { 变形: [原形, 关系] } }
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require2 = createRequire(import.meta.url);
const { noun, verb, adjective } = require2("wink-lemmatizer");

const clean = (s) => (s || "")
  .replace(/\\r\\n|\\n|\\r/g, "\n")   // 字面 \n 序列 → 真换行
  .replace(/\r/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

/* ── 1. 全语料 + 每季词表 ── */
const seasonTokens = new Map();   // s -> Set
const allTokens = new Set();
for (const f of readdirSync(join(ROOT, "data"))) {
  const m = f.match(/^s(\d+)\.json$/);
  if (!m) continue;
  const set = new Set();
  const text = readFileSync(join(ROOT, "data", f), "utf8");
  for (const t of text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)) {
    const w = t[0].toLowerCase();
    set.add(w); allTokens.add(w);
  }
  seasonTokens.set(+m[1], set);
}
console.log("语料独立词形:", allTokens.size);

/* ── 2. 第一遍 CSV：直接词条 + exchange 反查 ── */
const src = readFileSync(join(ROOT, "ecdict.csv"), "utf8");
const REL = { p: "过去式", d: "过去分词", i: "现在分词", "3": "第三人称单数", r: "比较级", t: "最高级", s: "原型", "0": "原形" };
const dict = {}, lemma = {};
let row = [], field = "", inQ = false, fieldStart = true, rowCount = 0, hit = 0;

const makeEntry = (w, r) => [
  r[1] || "", clean(r[2]), clean(r[3]), r[4] || "", +r[5] || 0, +r[6] || 0,
  (r[7] || "").split(" ").filter(Boolean).join(" "),
  +r[8] || 0, +r[9] || 0, (r[10] || "").replace(/\s+/g, ""),
];
function scanCSV(filterFn) {
  let row = [], field = "", inQ = false, fieldStart = true, rowCount = 0;
  const endField = () => { row.push(field); field = ""; fieldStart = true; };
  const endRow = () => {
    endField();
    if (row.length >= 11 && rowCount > 0) filterFn(row);
    row = []; rowCount++;
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"' && fieldStart) inQ = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") { field += ch; fieldStart = false; }
  }
  if (field || row.length) endRow();
}

const t0 = Date.now();
scanCSV((row) => {
  const w = row[0].toLowerCase();
  if (allTokens.has(w) && !dict[w]) { dict[w] = makeEntry(w, row); hit++; }
  const ex = row[10] || "";
  if (ex) {
    for (const part of ex.split("/")) {
      const c = part.indexOf(":");
      if (c < 1) continue;
      const key = part.slice(0, c), form = part.slice(c + 1).toLowerCase();
      if (form && allTokens.has(form) && !dict[form] && !lemma[form] && REL[key]) {
        lemma[form] = [w, REL[key]];
      }
    }
  }
});
console.log(`CSV 第一遍: 直接命中 ${hit}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

/* ── 2b. 第二遍 CSV：补收被映射引用、但自身不在语料中的原形词条 ── */
const neededBases = new Set();
for (const [form, [base]] of Object.entries(lemma)) {
  if (!dict[base]) neededBases.add(base);
}
if (neededBases.size) {
  let added = 0;
  scanCSV((row) => {
    const w = row[0].toLowerCase();
    if (neededBases.has(w) && !dict[w]) { dict[w] = makeEntry(w, row); added++; }
  });
  console.log(`CSV 第二遍: 补充原形词条 ${added}/${neededBases.size}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* ── 3. lemmatizer 补漏 ── */
let filled = 0;
for (const w of allTokens) {
  if (dict[w] || lemma[w]) continue;
  const cands = [verb(w), noun(w), adjective(w)].filter((c) => c && c !== w && dict[c]);
  if (cands.length) { lemma[w] = [cands[0], "原形"]; filled++; }
}
console.log(`lemmatizer 补充映射: ${filled}，变形映射总计: ${Object.keys(lemma).length}`);

/* ── 4. 分季输出 ── */
rmSync(join(ROOT, "data", "dict.json"), { force: true });          // 移除旧的单体大文件
mkdirSync(join(ROOT, "data", "dict"), { recursive: true });
let total = 0;
for (const [s, set] of [...seasonTokens.entries()].sort((a, b) => a[0] - b[0])) {
  const d = {}, l = {};
  for (const w of set) {
    if (dict[w]) d[w] = dict[w];
    else if (lemma[w] && dict[lemma[w][0]]) l[w] = lemma[w];
  }
  const out = JSON.stringify({ d, l });
  writeFileSync(join(ROOT, "data", "dict", `s${String(s).padStart(2, "0")}.json`), out);
  total += out.length;
  console.log(`  s${String(s).padStart(2, "0")}.json: ${(out.length / 1048576).toFixed(2)}MB，词条 ${Object.keys(d).length}，映射 ${Object.keys(l).length}`);
}
console.log(`分季词典总计 ${(total / 1048576).toFixed(1)}MB`);
