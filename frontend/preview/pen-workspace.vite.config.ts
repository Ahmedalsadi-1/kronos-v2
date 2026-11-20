// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    server: {
        host: "127.0.0.1",
        port: 7011,
        strictPort: true,
        proxy: { "^/pen/": { target: "http://localhost:9124", changeOrigin: true } },
    },
    build: {
        rollupOptions: { input: path.resolve(__dirname, "pen-workspace.html") },
        outDir: "../../output/pen-workspace-preview",
        emptyOutDir: true,
    },
});
