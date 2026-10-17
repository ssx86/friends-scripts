// 数据层：版本化 fetch + 各级缓存 + 全库语料
export const DATA_V = "v5";   // 数据重建后递增，防旧缓存

let INDEX = null, flat = null;
const seasonCache = new Map();
let corpus = null;

export async function getIndex() {
  if (INDEX) return INDEX;
  INDEX = (await (await fetch(`data/index.json?v=${DATA_V}`)).json());
  flat = INDEX.slice();
  return INDEX;
}
export async function getFlat() { await getIndex(); return flat; }

export async function loadSeason(s) {
  if (!seasonCache.has(s)) {
    seasonCache.set(s, fetch(`data/s${String(s).padStart(2, "0")}.json?v=${DATA_V}`).then((r) => r.json()));
  }
  return seasonCache.get(s);
}

export async function findEpisode(s, e) {
  const data = await loadSeason(s);
  return data.episodes.find((x) => String(x.e) === String(e));
}

/* 全库语料（懒加载，搜索/词表出处用），progress(n, total) 可选 */
export async function ensureCorpus(progress) {
  if (corpus) return corpus;
  const idx = await getIndex();
  const seasons = [...new Set(idx.map((x) => x.s))].sort((a, b) => a - b);
  const parts = [];
  for (let n = 0; n < seasons.length; n++) {
    const data = await loadSeason(seasons[n]);
    for (const ep of data.episodes) {
      parts.push({
        s: ep.s, e: ep.e, t: ep.t,
        lines: ep.lines
          .filter((l) => l.w !== undefined)
          .map((l) => ({
            idx: ep.lines.indexOf(l), k: "line", w: l.w,
            t: typeof l.p === "string" ? l.p : l.p.map((p) => p[0]).join(" "),
          })),
      });
    }
    progress && progress(n + 1, seasons.length);
  }
  corpus = parts;
  return corpus;
}

/* 按季词库分片 */
const dictCache = new Map();
export function fetchDictSlice(s) {
  if (!dictCache.has(s)) {
    dictCache.set(s, fetch(`data/dict/s${String(s).padStart(2, "0")}.json?v=${DATA_V}`).then((r) => r.json()));
  }
  return dictCache.get(s);
}

/* 单词表 */
let VOCAB = null;
export async function getVocab() {
  if (!VOCAB) VOCAB = (await (await fetch(`data/vocab.json?v=${DATA_V}`)).json());
  return VOCAB;
}
