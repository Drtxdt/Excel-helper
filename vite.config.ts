import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  base: "./",
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1800 },
  test: { testTimeout: 30000 },
});
