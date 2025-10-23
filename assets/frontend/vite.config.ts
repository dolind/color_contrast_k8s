import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/compute": "http://localhost:8080",
      "/metrics": "http://localhost:8080"
    }
  }
});
