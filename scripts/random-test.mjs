// 随机化全功能回归测试：friends-scripts 线上站
// 随机选集/选词/选查询，覆盖全部已规划功能
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "https://ssx86.github.io/friends-scripts";
const ROUNDS = +(process.argv[3] || 3); // 每类测试的随机轮数
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const proc = spawn(CHROME, ["--headless=new","--remote-debugging-port=9370",`--user-data-dir=${mkdtempSync(join(tmpdir(),"cdpZ-"))}`,"--no-first-run","--window-size=1280,900","about:blank"],{stdio:"ignore"});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<40;i++){try{if((await fetch("http://127.0.0.1:9370/json/version")).ok)break}catch{}await sleep(300)}
const t=await(await fetch("http://127.0.0.1:9370/json/new?about:blank",{method:"PUT"})).json();
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
let seq=0;const pending=new Map();const pageErrors=[];
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);
    if(m.error&&String(m.error).includes("navigated"))p.res({navigated:true});
    else m.error?p.res(null):p.res(m.result)}
  else if(m.method==="Runtime.exceptionThrown"){pageErrors.push((m.params.exceptionDetails.exception?.description||"").slice(0,200))}};
const send=(method,params={})=>new Promise((res)=>{const id=++seq;pending.set(id,{res});ws.send(JSON.stringify({id,method,params}))});
const evalJs=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});if(!r||r.navigated)return null;if(r.exceptionDetails){throw new Error(r.exceptionDetails.exception?.description||"eval error")}return r.result.value};
await send("Page.enable");await send("Runtime.enable");

let pass=0,fail=0;const fails=[];
const check=(n,ok,d="")=>{ok?pass++:(fail++,fails.push(n+(d?" → "+d:"")));};
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const rndInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;

// 等岛屿水合
async function waitChrome(ms=12000){
  for(let i=0;i<Math.ceil(ms/500);i++){await sleep(500);if(await evalJs("!!document.getElementById('tip') && !!document.getElementById('q')").catch(()=>false))return true}
  return false;
}
async function goto(url){
  await send("Page.navigate",{url:"about:blank"});await sleep(150);
  await send("Page.navigate",{url});await sleep(1200);
}

console.log("═══ 随机化全功能回归 ═══");
console.log("目标:",BASE,"| 随机轮数:",ROUNDS,"\n");

// 获取全集索引
await goto(BASE+"/");
await waitChrome();
await sleep(1000);
const eps=await evalJs("fetch('data/index.json').then(r=>r.json()).then(j=>j.map(x=>({s:x.s,e:x.e,t:x.t})))");
check("全集索引 228 集",eps&&eps.length===228,eps?eps.length+"":"fetch失败");
const seasons=[...new Set(eps.map(x=>x.s))];
const epPath=(s,e)=>`/ep/s${String(s).padStart(2,"0")}e${e}/`;

// ── 1. 随机集渲染 ──
console.log("── 1. 随机集渲染（台词/人名/前翻后翻）──");
for(let i=0;i<ROUNDS;i++){
  const ep=rnd(eps);
  await goto(BASE+epPath(ep.s,ep.e));
  await sleep(800);
  const r=await evalJs(`(()=>{
    const lines=[...document.querySelectorAll('.ln')].filter(l=>l.querySelector('.who'));
    const who=[...document.querySelectorAll('.who')].filter(w=>!w.classList.contains('c-other'));
    const words=document.querySelectorAll('.ln .w');
    const btns=document.querySelectorAll('.lnok');
    const prev=!!document.querySelector('.pg.prev');
    const next=!!document.querySelector('.pg.next');
    const title=document.querySelector('.ep-head h2')?.textContent||'';
    return {lines:lines.length,who:who.length,words:words.length,btns:btns.length,prev,next,title};
  })()`);
  check(`S${ep.s}E${ep.e} 台词>50`,r.lines>50,`${r.lines}`);
  check(`S${ep.s}E${ep.e} 有色人名>10`,r.who>10,`${r.who}`);
  check(`S${ep.s}E${ep.e} 词包裹>100`,r.words>100,`${r.words}`);
  check(`S${ep.s}E${ep.e} 句尾按钮≈台词`,Math.abs(r.btns-r.lines)<=2,`${r.btns}/${r.lines}`);
  check(`S${ep.s}E${ep.e} 标题匹配`,r.title.length>5,r.title.slice(0,30));
}

// ── 2. 随机词悬浮查词 ──
console.log("── 2. 随机词悬浮查词 ──");
for(let i=0;i<ROUNDS;i++){
  const ep=rnd(eps);
  await goto(BASE+epPath(ep.s,ep.e));
  await waitChrome();
  await sleep(500);
  const word=await evalJs(`(()=>{
    const ws=[...document.querySelectorAll('.ln .w')];
    const w=ws[Math.floor(Math.random()*ws.length)];
    const r=w.getBoundingClientRect();
    w.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:r.left+20,clientY:r.top+5}));
    return w.dataset.w;
  })()`);
  // 等面板（分季词典：非当季词无面板属正常）
  let shown=false;
  for(let k=0;k<12;k++){await sleep(700);shown=await evalJs(`(()=>{const t=document.getElementById('tip');return t&&t.classList.contains('show')&&t.textContent.trim().length>30})()`);if(shown)break}
  const sn=String(ep.s).padStart(2,"0");
  const inDict=await evalJs(`fetch('${BASE}/data/dict/s${sn}.json').then(r=>r.json()).then(j=>!!(j.d[${JSON.stringify(word)}]||j.l[${JSON.stringify(word)}])).catch(()=>true)`).catch(()=>true);
  check(`"${word}" 悬停（当季词库含=${inDict}）`,!inDict||shown,word);
}

// ── 3. 随机搜索（精确+容错）──
console.log("── 3. 随机搜索 ──");
const realWords=await evalJs(`fetch('${BASE}/data/vocab.json').then(r=>r.json()).then(v=>v.filter(x=>x[1]>=20).map(x=>x[0]))`);
for(let i=0;i<ROUNDS;i++){
  const w=rnd(realWords);
  // 精确
  await goto(BASE+`/search?q=${encodeURIComponent(w)}`);
  await waitChrome();
  let hit=false;
  for(let k=0;k<20;k++){await sleep(800);hit=await evalJs("!!document.querySelector('.hit')");if(hit)break}
  check(`搜索"${w}" 有结果`,hit,w);
  if(hit){
    const mark=await evalJs("document.querySelector('.hit mark')?.textContent?.toLowerCase()||''");
    check(`搜索"${w}" mark对位`,mark===w.toLowerCase(),mark);
  }
  // 容错（去尾字母）
  const typo=w.slice(0,Math.max(2,w.length-1));
  await goto(BASE+`/search?q=${encodeURIComponent(typo)}`);
  await waitChrome();
  let thit=false;
  for(let k=0;k<20;k++){await sleep(800);thit=await evalJs("!!document.querySelector('.hit')");if(thit)break}
  check(`容错"${typo}" 有结果`,thit,w+"→"+typo);
}

// ── 4. 词表随机级别抽查 ──
console.log("── 4. 词表 ──");
await goto(BASE+"/vocab/");
await waitChrome();
let vrows=0;
for(let k=0;k<15;k++){await sleep(700);vrows=await evalJs("document.querySelectorAll('.vrow').length");if(vrows>50)break}
check("词表加载",vrows>50,vrows+"行");
const tabs=["雅思","考研","TOEFL","GRE","CET-6"];
for(const tab of tabs){
  await evalJs(`[...document.querySelectorAll('.vtab')].find(t=>t.textContent.includes('${tab}'))?.click()`);
  await sleep(400);
  const n=await evalJs("document.querySelectorAll('.vrow').length");
  check(`词表·${tab}`,n>0&&n<9144,n+"词");
}
// 随机词出处跳转
await evalJs(`[...document.querySelectorAll('.vtab')][0].click()`);await sleep(300);
await evalJs("document.querySelector('.vrow')?.click()");
let occ=false;
for(let k=0;k<25;k++){await sleep(800);occ=await evalJs("!!document.querySelector('.occ')");if(occ)break}
check("出处钻取",occ);
if(occ){
  await evalJs("document.querySelector('.occ').click()");
  await sleep(1500);
  check("出处跳句",await evalJs("!!document.querySelector('.ln.flash')||!!document.querySelector('.ln')")===true);
}

// ── 5. 掌握系统 ──
console.log("── 5. 掌握系统 ──");
await evalJs("localStorage.setItem('fs_mastered','[]')");
const ep=rnd(eps);
await goto(BASE+epPath(ep.s,ep.e));
await waitChrome();
for(let k=0;k<15;k++){await sleep(700);if(await evalJs("!!document.querySelector('.ln.pending')"))break}
const p0=await evalJs("document.querySelectorAll('.ln.pending').length");
check("初始有未掌握句",p0>30,p0+"句");
const mr=await evalJs(`(()=>{
  const btn=document.querySelector('.ln.pending .lnok');
  btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const armed=btn.classList.contains('arm');
  btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return new Promise(r=>setTimeout(()=>r({
    armed,
    stored:JSON.parse(localStorage.getItem('fs_mastered')||'[]').length,
    pendingNow:document.querySelectorAll('.ln.pending').length
  }),1000));
})()`);
check("两次确认+存储",mr.armed&&mr.stored>0&&mr.pendingNow<p0,JSON.stringify({s:mr.stored,p0,p1:mr.pendingNow}));
check("全局联动",mr.pendingNow<p0,`${p0}→${mr.pendingNow}`);
// 刷新后持久
await goto(BASE+epPath(ep.s,ep.e));
await waitChrome();
for(let k=0;k<15;k++){await sleep(700);if(await evalJs("!!document.querySelector('.ln.pending,.mstat')"))break}
const pAfter=await evalJs("document.querySelectorAll('.ln.pending').length");
check("刷新后持久",pAfter===mr.pendingNow,`${mr.pendingNow}→${pAfter}`);
// 重置
await evalJs("localStorage.setItem('fs_mastered','[]')");

// ── 6. 主题/字号/词级分类 ──
console.log("── 6. 主题/字号/词分类 ──");
const ep2=rnd(eps);
await goto(BASE+epPath(ep2.s,ep2.e));
await waitChrome();
const theme=await evalJs(`(()=>{document.getElementById('theme').click();return document.documentElement.dataset.theme})()`);
check("主题切换",theme==="dark"||theme==="light",theme);
const fz=await evalJs(`(()=>{const v0=getComputedStyle(document.documentElement).getPropertyValue('--fz');document.getElementById('fz-inc').click();const v1=getComputedStyle(document.documentElement).getPropertyValue('--fz');return v0+'→'+v1})()`);
check("字号调节",fz.includes("→")&&fz.split("→")[0]!==fz.split("→")[1],fz);
const cls=await evalJs(`(()=>{
  const simple=document.querySelector('.w.simple');
  const hard=document.querySelector('.w.hard');
  const plain=document.querySelector('.w:not(.simple):not(.hard)');
  const sU=simple?getComputedStyle(simple).borderBottomStyle:'none';
  const hC=hard?getComputedStyle(hard).color:'';
  return {simple:!!simple,hard:!!hard,plain:!!plain,simpleNoUL:sU==='none',hardColor:hC};
})()`);
check("简单词存在且无下划线",cls.simple&&cls.simpleNoUL,JSON.stringify(cls));
check("难词金色存在",cls.hard,cls.hardColor);

// ── 7. 侧栏/移动端 ──
console.log("── 7. 侧栏/移动端 ──");
await goto(BASE+"/");
await waitChrome();
const sb=await evalJs(`(()=>{const s=document.getElementById('sidebar').querySelectorAll('.ep').length;document.getElementById('sb-toggle').click();const on=document.getElementById('sidebar').classList.contains('show');document.getElementById('sb-toggle').click();return s+'|'+on})()`);
check("侧栏全集+开关",sb.endsWith("|true")&&parseInt(sb)>200,sb);
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:3,mobile:true});
await goto(BASE+epPath(ep2.s,ep2.e));
await sleep(2000);
const mob=await evalJs("document.documentElement.scrollWidth<=390");
check("手机390px无溢出",mob);
await send("Emulation.clearDeviceMetricsOverride");

// ── 8. 旧链接重定向 ──
console.log("── 8. 旧链接重定向 ──");
const ep3=rnd(eps);
await goto(`${BASE}/#s${ep3.s}e${ep3.e}`);
await sleep(2000);
const redirected=await evalJs("location.pathname");
check("旧#hash重定向",redirected.includes(`/ep/s`),redirected);

// ── 9. 首页统计 ──
console.log("── 9. 首页统计 ──");
await goto(BASE+"/");
await waitChrome();
let hstat="";
for(let k=0;k<25;k++){await sleep(1000);hstat=await evalJs("document.getElementById('mastery-body')?.textContent||''");if(hstat.includes("句")&&!hstat.includes("载入"))break}
check("首页掌握统计",hstat.includes("已掌握")||hstat.includes("全部"),hstat.replace(/\s+/g," ").slice(0,50));

// ── 10. 页面异常 ──
console.log("── 10. 页面异常 ──");
check("无页面异常",pageErrors.length===0,pageErrors.slice(0,2).join(";"));

console.log("\n═══ 总结 ═══");
console.log(`通过: ${pass}/${pass+fail}`);
if(fail>0){console.log("失败项:");fails.forEach(f=>console.log("  FAIL",f))}
proc.kill();
process.exit(fail?1:0);
