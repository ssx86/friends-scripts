import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [preact()],
  output: "static",
  publicDir: "./public",
  base: "/friends-scripts/",   // 项目页子路径：所有资源与路由带此前缀
  vite: {
    assetsInclude: ["**/*.json"],
    plugins: [tailwindcss()],
  },
});