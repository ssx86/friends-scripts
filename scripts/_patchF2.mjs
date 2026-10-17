// 补丁 II：tip.ts 连字符查词回退 + 面板尺寸控制 CSS + 测试用例
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
function patch(file, pairs) {
  let s = readFileSync(file, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log("未匹配:", file, "→", a.slice(0, 80)); process.exit(1); }
    s = s.replace(a, b);
  }
  writeFileSync(file, s);
  console.log("✓", file);
}

/* 2) tip.ts：连字符词回退（整体→去尾连字符→分段最长命中） */
patch("src/components/tip.ts", [
  [`function lookup(w) {
  if (!st.DICT) return null;
  let e = st.DICT.d[w], lemmaBadge = "";
  if (!e && st.DICT.l[w]) { const [base, rel] = st.DICT.l[w]; e = st.DICT.d[base]; if (e) lemmaBadge = \`\${base} · \${rel}\`; }
  if (!e && /'s$/.test(w)) { const b = w.replace(/'s$/, ""); e = st.DICT.d[b]; if (e) lemmaBadge = \`\${b} · 所有格\`; }
  return e ? { e, lemmaBadge } : null;
}`,
`function lookupEntry(w) {
  if (!st.DICT) return null;
  let e = st.DICT.d[w], lemmaBadge = "";
  if (!e && st.DICT.l[w]) { const [base, rel] = st.DICT.l[w]; e = st.DICT.d[base]; if (e) lemmaBadge = \`\${base} · \${rel}\`; }
  if (!e && /'s$/.test(w)) { const b = w.replace(/'s$/, ""); e = st.DICT.d[b]; if (e) lemmaBadge = \`\${b} · 所有格\`; }
  return e ? { e, lemmaBadge } : null;
}
/* 连字符组合词：整体查不到时，按段查（长段优先），命中段作为释义 */
function lookup(w) {
  const direct = lookupEntry(w);
  if (direct) return direct;
  if (!st.DICT || !/-/.test(w)) return null;
  const bare = w.replace(/-+$/, "");
  if (bare !== w) { const r = lookupEntry(bare); if (r) { r.lemmaBadge = (r.lemmaBadge ? r.lemmaBadge + " · " : "") + bare; return r; } }
  const parts = w.split("-").filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of parts) {
    const r = lookupEntry(p);
    if (r) { r.lemmaBadge = (r.lemmaBadge ? r.lemmaBadge + " · " : "") + w + " 的组成部分"; return r; }
  }
  return null;
}`],
]);

/* 3) CSS：简单词无下划线、难词金色、面板尺寸受控（手机友好） */
patch("src/styles/global.css", [
  [`  #tip{
    position:fixed;z-index:95;width:340px;`,
`  /* 词级分类：简单词(中考/高考/超高频)无下划线；难且高频金色 */
  body.dict-on .ln .w.simple{border-bottom:none;cursor:default}
  .w.hard{color:var(--hard);font-weight:600}
  [data-theme="dark"] .w.hard{color:var(--hard-dark)}
  #tip{
    position:fixed;z-index:95;width:340px;max-width:92vw;max-height:min(64vh,480px);overflow-y:auto;overscroll-behavior:contain;`],
  [`  #tip.complex{width:432px;`,
`  #tip.complex{width:432px;max-width:94vw;`],
  [`  [data-theme="dark"] #tip{box-shadow:0 24px 60px -14px rgba(0,0,0,.85);}`,
`  [data-theme="dark"] #tip{box-shadow:0 24px 60px -14px rgba(0,0,0,.85)}
  :root{--hard:#a16207;--hard-dark:#fbbf24}
  @media (max-width:640px){
    #tip,#tip.complex{left:4vw !important;right:4vw;width:auto !important;max-width:none}
    #tip .tr{font-size:12.5px}
    #tip .tw b{font-size:17px}
  }`],
]);

unlinkSync("scripts/_patchF2.mjs");
console.log("补丁 II 完成");
