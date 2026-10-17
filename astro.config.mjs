import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

export default defineConfig({
  integrations: [preact()],
  output: "static",
  publicDir: "./public",
  vite: { assetsInclude: ["**/*.json"] },
});
