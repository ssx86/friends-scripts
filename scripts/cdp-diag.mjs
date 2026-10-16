// 诊断：注入 window.onerror 收集器，导航后读取页面运行时错误
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp2-"))}`,
  "--no-first-run", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
  await sleep(300);
}
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+(e.filename||'')+':'+e.lineno));window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+e.reason));`,
});
await send("Page.navigate", { url: "http://localhost:8763/#s1e12" });
await sleep(5000);
const errs = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__errs)", returnByValue: true });
console.log("页面运行时错误:", errs.result.value);
const state = await send("Runtime.evaluate", { expression: "'script len=' + document.querySelectorAll('.ln').length + ' who=' + document.querySelectorAll('.who').length + ' hash=' + location.hash", returnByValue: true });
console.log("页面状态:", state.result.value);
proc.kill();
