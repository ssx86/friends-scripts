// ECDICT → 语料词典构建（零依赖）
// 用法: 先 node scripts/build.mjs 生成 data/，再 node scripts/dict.mjs
// 输入: ecdict.csv（skywind3000/ECDICT 全量）+ data/s*.json
// 输出: data/dict.json = { d: { word: [音标,英文释义,中文释义,词性,collins,oxford,tag,bnc,frq,exchange] }, l: { 变形: [原形, 关系] } }
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 1. 收集语料词表 ── */
const tokens = new Set();
for (const f of readdirSync(join(ROOT, "data"))) {
  if (!/^s\d+\.json$/.test(f)) continue;
  const text = readFileSync(join(ROOT, "data", f), "utf8");
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'-]*/g)) tokens.add(m[0].toLowerCase());
}
console.log("语料独立词形:", tokens.size);

/* ── 2. 流式解析 CSV（字段可含引号内的逗号与换行） ── */
const src = readFileSync(join(ROOT, "ecdict.csv"), "utf8");
const REL = { p: "过去式", d: "过去分词", i: "现在分词", "3": "第三人称单数", r: "比较级", t: "最高级", s: "原型", "0": "原形" };
const dict = {}, lemma = {};
let row = [], field = "", inQ = false, fieldStart = true, rowCount = 0, hit = 0;

function endField() { row.push(field); field = ""; fieldStart = true; }
function endRow() {
  endField();
  if (row.length >= 11 && rowCount > 0) {
    const [word, ph, def, tr, pos, collins, oxford, tag, bnc, frq, ex] = row;
    const w = word.toLowerCase();
    if (tokens.has(w) && !dict[w]) {
      dict[w] = [
        ph || "", def || "", (tr || "").replace(/\\n/g, "\n"),
        pos || "", +collins || 0, +oxford || 0,
        (tag || "").split(" ").filter(Boolean).join(" "),
        +bnc || 0, +frq || 0, ex || "",
      ];
      hit++;
    }
    // 变形反查：把语料中出现的变形映射到原形词条
    if (ex) {
      for (const part of ex.split("/")) {
        const c = part.indexOf(":");
        if (c < 1) continue;
        const key = part.slice(0, c), form = part.slice(c + 1).toLowerCase();
        if (form && tokens.has(form) && !dict[form] && !lemma[form] && REL[key]) {
          lemma[form] = [w, REL[key]];
        }
      }
    }
  }
  row = []; rowCount++;
}

const t0 = Date.now();
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
console.log(`CSV 行数: ${rowCount}，直接命中: ${hit}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

/* ── 3. 输出 ── */
const out = JSON.stringify({ d: dict, l: lemma });
writeFileSync(join(ROOT, "data", "dict.json"), out);
const missing = [...tokens].filter((w) => !dict[w] && !lemma[w]);
console.log(`data/dict.json: ${(out.length / 1048576).toFixed(1)}MB，词条 ${Object.keys(dict).length}，变形映射 ${Object.keys(lemma).length}`);
console.log("语料未覆盖词（多为专名/缩写）:", missing.length, missing.slice(0, 12).join(" "));
