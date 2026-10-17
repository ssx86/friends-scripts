// 构建期：每季总词/总句统计 → data/season-stats.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const vocab = JSON.parse(readFileSync(join(ROOT, "data", "vocab.json"), "utf8"));
const w2i = new Map(vocab.map((v, i) => [v[0], i]));
const WRE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

const stats = {};
for (const f of readdirSync(join(ROOT, "data")).filter((x) => /^s\d+\.json$/.test(x)).sort()) {
  const season = JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
  const s = season.season;
  let totalLines = 0;
  const allWords = new Set();
  for (const ep of season.episodes) {
    for (const l of ep.lines) {
      if (l.w === undefined) continue;
      totalLines++;
      const text = typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join(" ");
      for (const m of text.matchAll(WRE)) {
        const wi = w2i.get(m[0].toLowerCase());
        if (wi !== undefined) allWords.add(wi);
      }
    }
  }
  stats[s] = { words: allWords.size, sentences: totalLines, episodes: season.episodes.length };
}
writeFileSync(join(ROOT, "data", "season-stats.json"), JSON.stringify(stats));
console.log("season-stats.json:", JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,`${v.words}词/${v.sentences}句`]))));
