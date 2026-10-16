// 单词表构建：全库词频 + ECDICT 级别 + 首行释义 → data/vocab.json
// 用法: node scripts/vocab.mjs（依赖 data/s*.json 与 data/dict/s*.json 已生成）
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 1. 全库词频（仅对白） ── */
const counts = new Map();
for (const f of readdirSync(join(ROOT, "data"))) {
  if (!/^s\d+\.json$/.test(f)) continue;
  const seasons = JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
  for (const ep of seasons.episodes) {
    for (const l of ep.lines) {
      if (l.k !== "line") continue;
      const text = l.p.map((p) => p[0]).join(" ");
      for (const m of text.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
        const w = m[0].toLowerCase();
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
  }
}
console.log("语料词形:", counts.size);

/* ── 2. 汇总词典（各季分片取并集；词条属性与季无关） ── */
const dict = new Map();   // word -> [ph,def,tr,pos,collins,oxford,tag,bnc,frq,ex]
for (const f of readdirSync(join(ROOT, "data", "dict"))) {
  const j = JSON.parse(readFileSync(join(ROOT, "data", "dict", f), "utf8"));
  for (const [w, e] of Object.entries(j.d)) if (!dict.has(w)) dict.set(w, e);
  for (const [form, [base]] of Object.entries(j.l)) {
    if (!dict.has(form) && dict.has(base)) dict.set(form, dict.get(base));  // 变形共享原形词条
  }
}
console.log("词典词条:", dict.size);

/* ── 3. 级别归类（一个词取最高级别） ── */
const LEVELS = ["gre", "toefl", "ielts", "ky", "cet6", "cet4"];
const out = [];
for (const [w, c] of counts) {
  if (c < 2) continue;                       // 只出现 1 次的词学习价值低
  const e = dict.get(w);
  if (!e) continue;                          // 专名/未收录不进词表
  const tags = new Set((e[6] || "").split(" "));
  let lv = "";
  for (const t of LEVELS) if (tags.has(t)) { lv = t; break; }
  if (!lv) lv = "common";                    // 无考试标签 → 常用词
  const gloss = (e[2] || "").split("\n")[0].replace(/^[(=][^)]*[)]\s*/, "").slice(0, 64);
  out.push([w, c, lv, gloss]);
}
out.sort((a, b) => b[1] - a[1]);
writeFileSync(join(ROOT, "data", "vocab.json"), JSON.stringify(out));
const byLv = {};
for (const [, , lv] of out) byLv[lv] = (byLv[lv] || 0) + 1;
console.log("vocab.json:", (out.length), "词", (statSync(join(ROOT, "data", "vocab.json")).size / 1048576).toFixed(2) + "MB");
console.log("级别分布:", JSON.stringify(byLv));
