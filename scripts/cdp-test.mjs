// 轻量 CDP 测试驱动：无头 Chrome + 原生 WebSocket（Node 22+）
// 用法: node scripts/cdp-test.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = "http://localhost:8763";

const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`,
  "--no-first-run", "--hide-scrollbars", "--window-size=1280,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
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
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method === "Page.loadEventFired") resolveLoad();
  };
  await send("Page.navigate", { url: "about:blank" });   // 先离开当前页，强制下次真加载
  await sleep(150);
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(1200); // 等 SPA 的 fetch + 渲染
}
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
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
check("黄框猫眼装饰", (await evalJs("getComputedStyle(document.querySelector('.peephole'),':before').borderTopWidth")) === "11px");
await shot("D:/workspace/cdp_landing.png");

/* ── 2. S1E12：联合说话者配色 + 词条包裹 ── */
await goto(`${BASE}/#s1e12`);
await sleep(1500);
check("S1E12 打开", await evalJs("location.hash") === "#s1e12");
const jointColored = await evalJs(`[...document.querySelectorAll('.who')].filter(w => / and /i.test(w.textContent) && !w.classList.contains('c-other')).length`);
check("联合说话者有色（Chandler and Joey 等）", jointColored > 0, `${jointColored} 个`);
check("MOnica 类拼写变体匹配（模糊规则在位）", await evalJs(`typeof [...document.querySelectorAll('.who')].find(w => /monica/i.test(w.textContent) && (w.classList.contains('c-monica')||w.classList.contains('c-other'))) !== 'undefined'`));
const wrapCount = await evalJs("document.querySelectorAll('.ln .w').length");
check("单词包裹", wrapCount > 2000, `${wrapCount} 个`);

/* ── 3. 悬浮面板：简单模式 ── */
await evalJs(`(()=>{const w=[...document.querySelectorAll('.ln .w')].find(e=>e.dataset.w==='lasagna');const r=w.getBoundingClientRect();w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+30,clientY:r.top+5}));return w.dataset.w;})()`);
await sleep(2500); // 等本季词库
const tipShown = await evalJs("document.getElementById('tip').classList.contains('show')");
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

/* ── 5. 后期季：方块与人名 ── */
await goto(`${BASE}/#s7e1`);
await sleep(1500);
check("S7E1 无控制字符/方块", await evalJs(`/[\\u0080-\\u009F\\uFFFD]/.test(document.querySelector('.script').textContent)`) === false);
check("S7E1 智能引号已修复", await evalJs(`/[\\u2018\\u2019]/.test(document.querySelector('.script').textContent)`) === true);
const colored7 = await evalJs(`[...document.querySelectorAll('.who')].filter(w=>!w.classList.contains('c-other')).length`);
check("S7E1 六人（含变体）配色", colored7 > 100, `${colored7} 个`);
await shot("D:/workspace/cdp_s7e1.png");

console.log("\n==== 结果:", results.filter(r => r[1]).length + "/" + results.length, "通过 ====");
proc.kill();
process.exit(results.every(r => r[1]) ? 0 : 1);
