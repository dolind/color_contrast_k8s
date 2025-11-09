import {defineConfig} from "vite";

export default defineConfig({
    root: ".",
    build: {
        outDir: "dist",
        rollupOptions: {
            output: {
                // Put worker bundles in a dedicated folder
                chunkFileNames: (chunkInfo) => {
                    if (chunkInfo.name.includes("worker")) {
                        return "workers/[name]-[hash].js";
                    }
                    return "assets/[name]-[hash].js";
                },
                entryFileNames: `assets/[name]-[hash].js`,
                assetFileNames: `assets/[name]-[hash].[ext]`,
            }
        }
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
