// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    resolve: { alias: { "@hermes": path.resolve(__dirname, "../hermes") } },
    server: { host: "127.0.0.1", port: 7007, strictPort: true },
    build: { rollupOptions: { input: path.resolve(__dirname, "pen-chat.html") }, outDir: "../../output/pen-chat-parity-preview", emptyOutDir: false },
});
