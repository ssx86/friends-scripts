// 构建期：每句台词的学习词序号清单 → data/lines.json
// 序号 = 词根（lemma）的 vocab 索引——标记 "went" 会消灭含 "goes" 的句子
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const vocab = JSON.parse(readFileSync(join(ROOT, "data", "vocab.json"), "utf8"));
const w2i = new Map(vocab.map((v, i) => [v[0], i]));
const lemmaMap = JSON.parse(readFileSync(join(ROOT, "data", "lemma-map.json"), "utf8"));
// 词形 → 词根索引（优先查 lemmaMap，查不到说明是原式本身，用自身索引）
const resolveLemma = (word) => {
  const li = lemmaMap[word];
  if (li !== undefined) return li;
  return w2i.get(word);  // 原式或不在词典的词
};
const WRE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

const eps = [];
const lines = [];
for (const f of readdirSync(join(ROOT, "data")).filter((x) => /^s\d+\.json$/.test(x)).sort()) {
  const season = JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
  for (const ep of season.episodes) {
    const start = lines.length;
    for (let i = 0; i < ep.lines.length; i++) {
      const l = ep.lines[i];
      if (l.w === undefined) continue;
      const text = typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join(" ");
      const idxs = new Set();
      for (const m of text.matchAll(WRE)) {
        const wi = resolveLemma(m[0].toLowerCase());
        if (wi !== undefined) idxs.add(wi);
      }
      lines.push([...idxs]);
    }
    eps.push({ s: ep.s, e: ep.e, start, n: lines.length - start });
  }
}
writeFileSync(join(ROOT, "data", "lines.json"), JSON.stringify({ v: 1, eps, lines }));
import { statSync as _stat } from "node:fs";
console.log(`lines.json：${lines.length} 句，含词句 ${lines.filter((l) => l.length).length}，大小 ${(_stat(join(ROOT, "data", "lines.json")).size / 1048576).toFixed(2)}MB`);
