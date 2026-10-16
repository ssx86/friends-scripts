# friends-scripts

老友记台词库：<https://ssx86.github.io/friends-scripts/>

十季 228 集（含 4 个连播合并集与花絮特辑）、44,784 条对白、88 万词，可全文搜索与阅读。

- `index.html`：阅读器 SPA（零依赖）；六位主角专属配色、场景标记、未删减片段蓝字标注
- `scripts/build.mjs`：数据构建脚本，从 `season/*.html`（原始转录，保留不动）解析生成 `data/*.json`
- 功能：全局搜索（懒加载语料）、明暗主题、字号调节、上下集键盘翻页（←/→）、`/` 聚焦搜索、深链接 `#s1e1`
- 数据来源：原始转录来自 [fangj/friends](https://fangj.github.io/friends/)，仅供学习
