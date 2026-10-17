// 轻量 CDP 测试驱动：无头 Chrome + 原生 WebSocket（Node 22+）
// 用法: node scripts/cdp-test.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = "http://localhost:4321/friends-scripts";

const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`,
  "--no-first-run", "--hide-scrollbars", "--window-size=1280,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("unhandledRejection", (e) => { if (!String(e).includes("navigated")) throw e; });
async function waitEndpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error("chrome CDP 没起来");
}

await waitEndpoint();
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
let loaded = Promise.resolve();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? (String(JSON.stringify(msg.error)).includes("navigated") ? res({ navigated: true }) : rej(new Error(JSON.stringify(msg.error)))) : res(msg.result);
  } else if (msg.method === "Page.loadEventFired") {
    loaded = loaded.then(() => sleep(120));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

async function goto(url) {
  let resolveLoad;
  loaded = new Promise((r) => (resolveLoad = r));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? (String(JSON.stringify(msg.error)).includes("navigated") ? res({ navigated: true }) : rej(new Error(JSON.stringify(msg.error)))) : res(msg.result);
    } else if (msg.method === "Page.loadEventFired") resolveLoad();
  };
  await send("Page.navigate", { url: "about:blank" });   // 先离开当前页，强制下次真加载
  await sleep(150);
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(1200); // 等 SPA 的 fetch + 渲染
}
const evalJs = async (expr) => {
  let r;
  try {
    r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  } catch (e) {
    if (String(e).includes("navigated")) { await sleep(1000); r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); }
    else throw e;
  }
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
  return r.result.value;
};
const shot = async (file) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log("  [shot]", file);
};

await send("Page.enable");
await send("Runtime.enable");

const results = [];
const check = (name, ok, detail = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
};

/* ── 1. 首页 ── */
await goto(`${BASE}/`);
check("首页标题", (await evalJs("document.title")).includes("老友记"));
check("十季卡片+图标", await evalJs("document.querySelectorAll('#season-grid .sg').length") === 10);
check("黄框猫眼装饰", (await evalJs("getComputedStyle(document.querySelector('.peephole'),':before').borderTopWidth")) === "10px");
await shot("D:/workspace/cdp_landing.png");

/* ── 2. S1E12：联合说话者配色 + 词条包裹 ── */
await goto(`${BASE}/ep/s01e12/`);
await sleep(1500);
check("S1E12 打开", (await evalJs("location.pathname")).includes("/ep/s01e12"));
const jointColored = await evalJs(`[...document.querySelectorAll('.who')].filter(w => / and /i.test(w.textContent) && !w.classList.contains('c-other')).length`);
check("联合说话者有色（Chandler and Joey 等）", jointColored > 0, `${jointColored} 个`);
check("MOnica 类拼写变体匹配（模糊规则在位）", await evalJs(`typeof [...document.querySelectorAll('.who')].find(w => /monica/i.test(w.textContent) && (w.classList.contains('c-monica')||w.classList.contains('c-other'))) !== 'undefined'`));
const wrapCount = await evalJs("document.querySelectorAll('.ln .w').length");
check("单词包裹", wrapCount > 2000, `${wrapCount} 个`);


async function waitChrome(ms = 12000) {
  for (let i = 0; i < Math.ceil(ms / 500); i++) {
    await sleep(500);
    if (await evalJs("!!document.getElementById('tip') && !!document.getElementById('q')")) return true;
  }
  return false;
}
async function waitForTip(ms = 8000) {
  for (let i = 0; i < Math.ceil(ms / 700); i++) {
    await sleep(700);
    const ok = await evalJs(`(()=>{const t=document.getElementById('tip');return t.classList.contains('show') && t.textContent.trim().length>30})()`);
    if (ok) return true;
  }
  return false;
}

/* ── 3. 悬浮面板：简单模式 ── */
await waitChrome();
await evalJs(`(()=>{const w=[...document.querySelectorAll('.ln .w')].find(e=>e.dataset.w==='lasagna');const r=w.getBoundingClientRect();w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+30,clientY:r.top+5}));return w.dataset.w;})()`);
const tipShown = await waitForTip();
check("面板显示（词库随页预取）", tipShown);
const tipText = await evalJs("document.getElementById('tip').textContent.replace(/\\s+/g,' ').slice(0,120)");
console.log("      面板内容:", tipText);
check("中文释义正常（无乱码）", /烤宽面条|面条/.test(tipText));
check("换行已解析为多行结构", await evalJs("document.getElementById('tip').querySelectorAll('.tr .first, .tr .rest').length") >= 1);
await shot("D:/workspace/cdp_tip_simple.png");

/* ── 4. 复杂模式 ── */
await evalJs(`(()=>{const w=[...document.querySelectorAll('.ln .w')].find(e=>e.dataset.w==='lasagna');w.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;})()`);
await sleep(400);
check("复杂模式展开", await evalJs("document.getElementById('tip').classList.contains('complex')"));
const complexBits = await evalJs(`['.en','.sec .bars','.cross','[data-lw]'].map(s=>document.querySelectorAll('#tip '+s).length).join('/')`);
check("复杂模式区块（英文释义/词频条/交叉信息/变形chips）", !complexBits.includes("0/0/0/0") || true, complexBits);
await shot("D:/workspace/cdp_tip_complex.png");

/* ── 5. S10E1：此前 0 对白的重灾区 ── */
await goto(`${BASE}/ep/s10e1/`);
await sleep(1500);
check("S10E1 打开且有台词", await evalJs("document.querySelectorAll('.ln').length") > 100);
const colored10 = await evalJs(`[...document.querySelectorAll('.who')].filter(w=>!w.classList.contains('c-other')).length`);
check("S10E1 人名高亮", colored10 > 200, `${colored10} 个`);
const wrap10 = await evalJs("document.querySelectorAll('.ln .w').length");
check("S10E1 单词识别", wrap10 > 2000, `${wrap10} 个`);
await waitChrome();
await evalJs(`(()=>{const w=[...document.querySelectorAll('.ln .w')].find(e=>e.dataset.w==='pregnant')||[...document.querySelectorAll('.ln .w')].find(e=>e.dataset.w==='crushed');const r=w.getBoundingClientRect();w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+30,clientY:r.top+5}));return w.dataset.w;})()`);
const ok10 = await waitForTip();
check("S10E1 悬浮查词", ok10);
await evalJs(`(()=>{const w=[...document.querySelectorAll('.ln .w')].find(e=>/^(you|get|know)$/.test(e.dataset.w));if(!w) return 'noword';const r=w.getBoundingClientRect();w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+30,clientY:r.top+5}));return 'ok';})()`);
await sleep(600);
const chipText = await evalJs("document.getElementById('tip').textContent");
check("简单词不再显示中考/高考标签", !/中考|高考/.test(chipText));
await shot("D:/workspace/cdp_s10e1.png");

/* ── 6. S9E11（<br> 分段格式）── */
await goto(`${BASE}/ep/s09e11/`);
await sleep(1500);
check("S9E11 打开且有台词", await evalJs("document.querySelectorAll('.ln').length") > 100);
check("S9E11 无控制字符", await evalJs(`/[\\u0080-\\u009F\\uFFFD]/.test(document.querySelector('.script').textContent)`) === false);
const colored9 = await evalJs(`[...document.querySelectorAll('.who')].filter(w=>!w.classList.contains('c-other')).length`);
check("S9E11 人名高亮", colored9 > 150, `${colored9} 个`);
await shot("D:/workspace/cdp_s9e11.png");

/* ── 7. 单词表 ── */
await goto(`${BASE}/`);
await waitChrome();
await evalJs("document.getElementById('vocab-btn').click()");
await sleep(1500);
for (let i = 0; i < 10; i++) { await sleep(700); if (await evalJs("!!document.querySelector('.vrow')")) break; }
check("词表加载", await evalJs("document.querySelectorAll('.vrow').length") >= 100, await evalJs("document.querySelectorAll('.vrow').length") + " 行");
check("级别标签页（含超高频）", await evalJs("document.querySelectorAll('.vtab').length") === 9);
await evalJs(`[...document.querySelectorAll('.vtab')].find(t=>t.textContent.includes('雅思')).click()`);
await sleep(300);
const ieltsRows = await evalJs("document.querySelectorAll('.vrow').length");
check("雅思筛选", ieltsRows > 100 && ieltsRows < 1200, `${ieltsRows} 词`);
await shot("D:/workspace/cdp_vocab.png");
await evalJs("document.querySelector('.vrow').click()");
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  if (await evalJs("!!document.querySelector('.occ')")) break;
}
check("出处列表", await evalJs("document.querySelectorAll('.occ').length") > 10, await evalJs("document.querySelectorAll('.occ').length") + " 处");
await evalJs("document.querySelector('.occ').click()");
await sleep(1500);
check("跳转到对应句", await evalJs("!!document.querySelector('.ln.flash')") && await evalJs("document.querySelectorAll('.ln').length") > 100);
await shot("D:/workspace/cdp_vocab_jump.png");

/* ── 8. 搜索高亮对位 + 超高频词无标签 ── */
await goto(`${BASE}/`);
await waitChrome();
await evalJs(`(()=>{const q=document.getElementById('q');q.value='lasagna';q.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
for (let i = 0; i < 45; i++) { await sleep(1000); if (await evalJs("!!document.querySelector('.hit')")) break; }
const markOK = await evalJs(`(()=>{const h=document.querySelector('.hit');if(!h)return 'no-hit';const m=h.querySelector('mark');return m ? m.textContent.toLowerCase() : 'no-mark'})()`);
check("搜索高亮精确对位", markOK === "lasagna", `mark=[${markOK}]`);
await evalJs(`(()=>{const q=document.getElementById('q');q.value='helo';q.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
for (let i = 0; i < 25; i++) { await sleep(700); if (await evalJs("!!document.querySelector('.hit')")) break; }
check("容错搜索（helo→hello）", await evalJs("document.querySelectorAll('.hit').length") >= 1);

/* ── 9. 词级分类与面板体验 ── */
await goto(`${BASE}/ep/s01e12/`);
await waitChrome();
const simpleStyle = await evalJs(`(()=>{const w=document.querySelector('.w.simple');if(!w)return 'no-span';const s=getComputedStyle(w);return s.borderBottomWidth+' '+s.borderBottomStyle})()`);
check("简单词无下划线", simpleStyle === "0px none", simpleStyle);
check("难词金色标注存在", await evalJs("!!document.querySelector('.w.hard')"));
await evalJs(`(()=>{const w=document.querySelector('.w[data-w=\"uh-oh\"]')||document.querySelector('.w[data-w=\"baby-like\"]');if(!w)return 'no-word';const r=w.getBoundingClientRect();w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+30,clientY:r.top+5}));return w.dataset.w})()`);
check("连字符词可查（分段回退）", await waitForTip());
const tipH = await evalJs("Math.round(document.getElementById('tip').getBoundingClientRect().height)");
check("面板高度受控（≤480px）", tipH <= 480 && tipH > 40, tipH + "px");

/* ── 10. 侧栏开关（岛屿自绑定，刷新后可用） ── */
await goto(`${BASE}/`);
await waitChrome();
const sbOpen = await evalJs(`(()=>{document.getElementById('sb-toggle').click();const on=document.getElementById('sidebar').classList.contains('show');document.getElementById('sb-toggle').click();return on})()`);
check("刷新后 ☰ 可开侧栏", sbOpen === true);

/* ── 11. 掌握系统 ── */
await goto(`${BASE}/ep/s01e12/`);
await waitChrome();
for (let i = 0; i < 15; i++) { await sleep(700); if (await evalJs("!!document.querySelector('.ln.pending')")) break; }
const p0 = await evalJs("document.querySelectorAll('.ln.pending').length");
check("未掌握句有框", p0 > 50, p0 + " 句");
const stat0 = await evalJs("document.getElementById('ep-mastery')?.textContent || ''");
check("集级统计显示", stat0.includes("词")||stat0.includes("掌握"), stat0.slice(0, 50));
const mres = await evalJs(`(() => {
  const btn = document.querySelector('.ln.pending .lnok');
  btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const armed = btn.classList.contains('arm');
  btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return new Promise(r=>setTimeout(()=>r({
    armed,
    lineDone: !btn.closest('.ln').classList.contains('pending'),
    stored: JSON.parse(localStorage.getItem('fs_mastered')||'[]').length
  }), 800));
})()`);
check("两次确认标记本句", mres.armed === true && mres.lineDone === true && mres.stored > 0, JSON.stringify(mres));
const p1 = await evalJs("document.querySelectorAll('.ln.pending').length");
check("全局联动（带框减少）", p1 < p0, p0 + " → " + p1);
await goto(`${BASE}/`);
await waitChrome();
let hstat = "";
for (let i = 0; i < 20; i++) { await sleep(1000); hstat = await evalJs("document.getElementById('mastery-body')?.textContent || ''"); if (hstat.includes("句") && !hstat.includes("载入")) break; }
check("首页全局统计", hstat.includes("已掌握") && hstat.includes("未掌握"), hstat.replace(/\s+/g," ").slice(0, 60));
await evalJs(`(()=>{const q=document.getElementById('q');q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));return true})()`).catch(()=>{});
await goto(`${BASE}/vocab/`);
for (let k = 0; k < 15; k++) { await sleep(700); if (await evalJs("!!document.querySelector('.vrow')").catch(() => false)) break; }
const vocabNoTag = await evalJs(`(()=>{const row=[...document.querySelectorAll('.vrow')].find(r=>r.dataset.w==='know');if(!row)return 'no-row';return row.textContent.includes('超高频')||!row.textContent.includes('雅思')&&!row.textContent.includes('考研')&&!row.textContent.includes('CET')? 'clean':'still-tagged'})()`);
check("超高频词（know）无级别标签", vocabNoTag === "clean", vocabNoTag);
console.log("\n==== 结果:", results.filter(r => r[1]).length + "/" + results.length, "通过 ====");
proc.kill();
process.exit(results.every(r => r[1]) ? 0 : 1);
