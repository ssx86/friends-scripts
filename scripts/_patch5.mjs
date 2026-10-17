// 补丁：岛屿与构建工具全部 base-aware
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function patch(file, pairs) {
  let s = readFileSync(file, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log("未匹配:", file, "→", a.slice(0, 70)); process.exit(1); }
    s = s.replace(a, b);
  }
  writeFileSync(file, s);
  console.log("✓", file);
}

patch("src/components/Chrome.tsx", [
  ['const epPath = (s, e) => `/ep/s${pad(s)}e${e}/`;',
   'const BASE = import.meta.env.BASE_URL;\nconst epPath = (s, e) => `${BASE}ep/s${pad(s)}e${e}/`;'],
  ['const m = location.pathname.match(/^\\/ep\\/s(\\d{2})e([\\w-]+)\\/?$/);',
   'const m = location.pathname.slice(BASE.length - 1).match(/^\\/ep\\/s(\\d{2})e([\\w-]+)\\/?$/);'],
  ['<a class="brand" href="/">', '<a class="brand" href={BASE}>'],
  ['<a class="tbtn" id="vocab-btn" href="/vocab/"', '<a class="tbtn" id="vocab-btn" href={BASE + "vocab/"}'],
  ['if (location.pathname.startsWith("/search")) {', 'if (location.pathname.startsWith(BASE + "search")) {'],
  ['location.href = "/search?q=" + encodeURIComponent(q);', 'location.href = BASE + "search?q=" + encodeURIComponent(q);'],
  ['history.replaceState(null, "", "/search?q=" + encodeURIComponent(q));', 'history.replaceState(null, "", BASE + "search?q=" + encodeURIComponent(q));'],
  ['fetch(`/data/index.json`)', 'fetch(`${BASE}data/index.json`)'],
]);

patch("src/components/tip.ts", [
  ['const esc = (s)', 'const BASE = import.meta.env.BASE_URL || "/";\nexport const esc = (s)'],
  ['fetch(`/data/dict/${pad(s)}.json`)', 'fetch(`${BASE}data/dict/${pad(s)}.json`)'],
  ['href="/search?q=${encodeURIComponent(w)}"', 'href="${BASE}search?q=${encodeURIComponent(w)}"'],
]);

patch("src/components/VocabIsland.tsx", [
  ['const pad = (n) => String(n).padStart(2, "0");', 'const BASE = import.meta.env.BASE_URL || "/";\nconst pad = (n) => String(n).padStart(2, "0");'],
  ['fetch("data/index.json")', 'fetch(`${BASE}data/index.json`)'],
  ['fetch(`data/s${pad(seasons[n])}.json`)', 'fetch(`${BASE}data/s${pad(seasons[n])}.json`)'],
  ['fetch("data/vocab.json")', 'fetch(`${BASE}data/vocab.json`)'],
  ['history.replaceState(null, "", "/vocab/");', 'history.replaceState(null, "", `${BASE}vocab/`);'],
  ['history.replaceState(null, "", "/vocab/?w=" + encodeURIComponent(word));', 'history.replaceState(null, "", `${BASE}vocab/?w=` + encodeURIComponent(word));'],
  ['href={`/ep/s${pad(ep.s)}e${ep.e}/#L${l.idx}`}', 'href={`${BASE}ep/s${pad(ep.s)}e${ep.e}/#L${l.idx}`}'],
]);

patch("src/components/SearchIsland.tsx", [
  ['const SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];', 'const BASE = import.meta.env.BASE_URL || "/";\nconst SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];'],
  ['fetch("data/index.json")', 'fetch(`${BASE}data/index.json`)'],
  ['fetch(`data/s${pad(seasons[n])}.json`)', 'fetch(`${BASE}data/s${pad(seasons[n])}.json`)'],
  ['location.href = `/ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`;', 'location.href = `${BASE}ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`;'],
  ['key={`${h.ep.s}-${h.ep.e}-${h.l.idx}`} href={`/ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`}', 'key={`${h.ep.s}-${h.ep.e}-${h.l.idx}`} href={`${BASE}ep/s${pad(h.ep.s)}e${h.ep.e}/#L${h.l.idx}`}'],
]);

// 首页封面图
patch("src/pages/index.astro", [
  ['<img class="cover" src="/cover.jpg"', '<img class="cover" src={import.meta.env.BASE_URL + "cover.jpg"}'],
]);

unlinkSync("scripts/_patch5.mjs");
console.log("全部 base 化完成");
