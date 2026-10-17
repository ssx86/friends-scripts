// 共享工具：转义、角色配色、单词包裹、图标
import htm from "htm";
import { h } from "preact";
export const html = htm.bind(h);

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pad = (n) => String(n).padStart(2, "0");

/* 角色配色：精确 + 词边界模糊（Chandler and Joey / MOnica / Fake Monica…） */
export const SIX = ["Monica", "Rachel", "Phoebe", "Ross", "Chandler", "Joey"];
const SIX_RE = SIX.map((n) => [n, new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, "i")]);
export function whoClass(w) {
  if (!w) return "c-other";
  for (const [n, re] of SIX_RE) if (re.test(w)) return "c-" + n.toLowerCase();
  return "c-other";
}

export const WRE = /[A-Za-z][A-Za-z'-]*/g;
export function wordify(text) {
  let out = "", last = 0;
  for (const m of text.matchAll(WRE)) {
    out += esc(text.slice(last, m.index));
    out += `<span class="w" data-w="${m[0].toLowerCase()}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

export const SEASON_DOTS = ["#e0603c", "#4d8a5a", "#c9722e", "#7d64ad", "#3e7ca6", "#b0483f", "#5a8a3e", "#94639c", "#3f7f8a", "#a8683a"];
export const ICONS = {
  mug: `<path d="M18 32h24v9a11 11 0 0 1-11 11h-2a11 11 0 0 1-11-11z" fill="currentColor"/><path d="M42 34h4.5a5.5 5.5 0 0 1 0 11H42" stroke="currentColor" stroke-width="3.5"/>`,
  umbrella: `<path d="M32 9C20 9 10 18 8 29c3-2 6-2 8 0 2-2 5-2 8 0 2-2 5-2 8 0s6 2 8 0c2-2 5-2 8 0-2-11-12-20-24-20z" fill="currentColor"/><path d="M32 29v20a6 6 0 0 0 6 6" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  couch: `<path d="M12 34c0-4 3-6 6-6h28c3 0 6 2 6 6v4H12z" fill="currentColor"/><rect x="8" y="38" width="48" height="8" rx="3" fill="currentColor" opacity=".75"/><path d="M16 46v6M48 46v6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  frame: `<rect x="14" y="16" width="36" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="4.5" fill="currentColor"/>`,
  guitar: `<path d="M38 10l6 6-9 9c3 2 4 5 3 8-1.5 4.5-7 7-12 5s-7-7-5-11c1.5-3 4.5-4 7-3l10-10 0-4z" fill="currentColor" transform="translate(-4 4)"/>`,
  heart: `<path d="M32 50C18 40 12 32 12 24a9 9 0 0 1 16-5.5A9 9 0 0 1 44 24c0 8-6 16-12 26z" fill="currentColor"/>`,
};
export const SEASON_ICONS = ["mug", "umbrella", "couch", "frame", "guitar", "heart", "mug", "umbrella", "couch", "frame"];

export const LVL_META = {
  ielts: ["雅思", "var(--c-rachel)"], ky: ["考研", "var(--c-phoebe)"], cet6: ["CET-6", "var(--c-chandler)"],
  cet4: ["CET-4", "var(--c-chandler)"], toefl: ["TOEFL", "var(--door)"], gre: ["GRE", "var(--c-ross)"],
  common: ["常用", "var(--faint)"],
};
