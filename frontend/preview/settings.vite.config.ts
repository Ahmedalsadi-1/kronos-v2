import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig } from "vite";
export default defineConfig({
    root: __dirname,
    plugins: [react(), tailwindcss()],
    optimizeDeps: { entries: ["settings.html", "aside-settings.html"] },
    build: {
        rollupOptions: {
            input: [path.resolve(__dirname, "settings.html"), path.resolve(__dirname, "aside-settings.html")],
        },
        outDir: "../../output/settings-polish/build",
        emptyOutDir: false,
    },
    resolve: {
        alias: [
            { find: "@/app/store/wshclientapi", replacement: path.resolve(__dirname, "mock/aside-settings-api.ts") },
            { find: "@/app/store/wshrpcutil", replacement: path.resolve(__dirname, "mock/aside-settings-api.ts") },
            { find: "@/app/store/global", replacement: path.resolve(__dirname, "mock/aside-settings-api.ts") },
            { find: /^@hermes\/shared\/(.*)$/, replacement: path.resolve(__dirname, "../hermes-shared/$1") },
            { find: "@hermes/shared", replacement: path.resolve(__dirname, "../hermes-shared/index.ts") },
            { find: "@hermes", replacement: path.resolve(__dirname, "../hermes") },
            { find: "@", replacement: path.resolve(__dirname, "..") },
        ],
    },
    server: { host: "127.0.0.1", port: 7008, strictPort: true },
});
