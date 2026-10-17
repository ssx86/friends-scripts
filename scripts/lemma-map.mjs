// 构建词根归并映射：所有词形 → 原式（lemma）的 vocab 索引
// 输出 data/lemma-map.json = { 词形字符串: 原式的vocab索引 }
// 效果：标记 "went" 会同时消灭含 "goes"/"going"/"gone" 的句子
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const require2 = createRequire(import.meta.url);
const { noun, verb, adjective } = require2("wink-lemmatizer");

const vocab = JSON.parse(readFileSync(join(ROOT, "data", "vocab.json"), "utf8"));
const w2i = new Map(vocab.map((v, i) => [v[0], i]));

// 1. 从 ECDICT 的 exchange 字段收集变形关系
const formToLemma = new Map();  // word_string → lemma_string
for (const f of readdirSync(join(ROOT, "data", "dict"))) {
  const j = JSON.parse(readFileSync(join(ROOT, "data", "dict", f), "utf8"));
  for (const [w, e] of Object.entries(j.d)) {
    const ex = String(e[9] || "");
    for (const part of ex.split("/")) {
      const c = part.indexOf(":");
      if (c < 1) continue;
      const key = part.slice(0, c);
      const form = part.slice(c + 1).toLowerCase();
      if (form && /^[pdi3rt]$/.test(key) && !formToLemma.has(form)) {
        formToLemma.set(form, w);
      }
    }
  }
  for (const [form, [base]] of Object.entries(j.l)) {
    if (!formToLemma.has(form)) formToLemma.set(form, base);
  }
}

// 2. wink-lemmatizer 兜底（覆盖 exchange 没有的）
for (const [w] of vocab) {
  if (formToLemma.has(w)) continue;
  for (const fn of [verb, noun, adjective]) {
    const lemma = fn(w);
    if (lemma && lemma !== w && w2i.has(lemma)) {
      formToLemma.set(w, lemma);
      break;
    }
  }
}

// 3. 构建最终映射：词形字符串 → 原式的 vocab 索引
const lemmaMap = {};
for (const [w, i] of w2i) {
  const lemma = formToLemma.get(w);
  if (lemma !== undefined && w2i.has(lemma)) {
    lemmaMap[w] = w2i.get(lemma);  // 该词形的原式索引
  }
  // 没有映射的词（原式本身或无法归并的）→ 不出现在 map 中，查不到时 fallback 到自身索引
}

writeFileSync(join(ROOT, "data", "lemma-map.json"), JSON.stringify(lemmaMap));
const groups = {};
for (const [w, li] of Object.entries(lemmaMap)) {
  groups[li] = (groups[li] || 0) + 1;
}
const groupSizes = Object.values(groups);
console.log(`lemma-map.json: ${Object.keys(lemmaMap).length} 词形映射到 ${Object.keys(groups).length} 个原式`);
console.log(`最大组: ${Math.max(...groupSizes)} 个词形 | 平均组: ${(Object.keys(lemmaMap).length / Object.keys(groups).length).toFixed(1)}`);
// 抽查
for (const w of ["went", "goes", "going", "gone", "mice", "ran", "better", "children"]) {
  const li = lemmaMap[w];
  console.log(`  ${w} → ${li !== undefined ? vocab[li][0] + " (idx:" + li + ")" : "无映射(原式)"}`);
}
