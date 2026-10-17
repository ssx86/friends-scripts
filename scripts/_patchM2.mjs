// 补丁 II：Chrome 里实现 renderGlobalStats + CSS
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

patch("src/components/Chrome.tsx", [
  [`function Sidebar({ index, cur }) {`,
`async function renderGlobalStats() {
  const body = document.getElementById("mastery-body");
  if (!body) return;
  try {
    const st = await globalStats();
    const rows = levelOrder.filter((k) => st.per[k] > 0);
    body.innerHTML = \`
      <div class="vsub">已掌握 \${st.done} / \${st.total} 句 · 未掌握词 \${st.unWords} 个 · 按未掌握词的最高级别归句：</div>
      <div class="mrow">
        \${rows.map((k) => \`<span class="mchip lv-\${k || "top"}"><b>\${st.per[k]}</b> 句 · \${levelName(k)}</span>\`).join("")}
        \${!rows.length ? '<span class="vsub">全部掌握！</span>' : ""}
      </div>
      <a class="mreset" id="mreset">重置进度</a>\`;
    document.getElementById("mreset").addEventListener("click", function arm() {
      if (this.classList.contains("arm")) { resetMastery(); renderGlobalStats(); }
      else { this.classList.add("arm"); this.textContent = "再点一次确认重置"; setTimeout(() => { this.classList.remove("arm"); this.textContent = "重置进度"; }, 3000); }
    });
  } catch (e) {
    body.innerHTML = '<div class="vsub">统计载入失败：' + e.message + "</div>";
  }
}

function Sidebar({ index, cur }) {`],
]);

/* CSS */
let css = readFileSync("src/styles/global.css", "utf8");
css += `
/* ── 掌握系统：未掌握句框 + 句尾确认按钮 + 统计 ── */
.ln.pending{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent);border-radius:8px;background:color-mix(in srgb,var(--accent) 6%,transparent)}
.lnok{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:9px;border:1px solid var(--line);border-radius:6px;
  background:var(--panel);color:var(--faint);font-size:12px;line-height:1;vertical-align:-4px;opacity:.45;transition:.18s;user-select:none}
.ln.pending .lnok{opacity:.95;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 50%,transparent)}
.lnok:hover{opacity:1!important;color:var(--accent);border-color:var(--accent)}
.lnok.arm{background:var(--accent);color:#fff;border-color:var(--accent);opacity:1!important;width:auto;padding:0 8px;font-size:11px}
.mstat{font-family:var(--sans);font-size:13px;color:var(--dim);margin-top:10px}
.mstat b{color:var(--accent);font-family:var(--serif);font-size:16px}
.panel{margin:42px 0 0;padding:22px 0 6px;border-top:1px solid var(--line);text-align:left}
.panel h2{font-family:var(--serif);font-size:21px;margin-bottom:12px}
.mrow{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 6px;justify-content:center}
.mchip{border:1px solid var(--line);border-radius:99px;padding:5px 14px;font-size:13px;color:var(--dim);background:var(--panel)}
.mchip b{font-family:var(--serif);font-size:17px;color:var(--accent);margin-right:2px}
.mreset{display:inline-block;margin-top:10px;font-family:var(--mono);font-size:11.5px;color:var(--faint);cursor:pointer;letter-spacing:.1em}
.mreset:hover{color:var(--red)}
.mreset.arm{color:var(--red)}
`;
writeFileSync("src/styles/global.css", css);
console.log("✓ CSS");
unlinkSync("scripts/_patchM2.mjs");
