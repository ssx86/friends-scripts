// 构建期把数据文件同步进 public/（客户端岛屿 fetch 用）
import { cpSync, mkdirSync, existsSync } from "node:fs";
mkdirSync("public", { recursive: true });
cpSync("data", "public/data", { recursive: true });
if (!existsSync("public/cover.jpg")) cpSync("cover.jpg", "public/cover.jpg");
console.log("data → public/data 同步完成");
