// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import { liveDevicePreview } from "./devices-live-preview";

export default defineConfig({
    root: __dirname,
    base: "./",
    // Serve the workspace-root public/ directory so Font Awesome and other
    // static assets (served by Electron in the real app) are available here too.
    publicDir: path.resolve(__dirname, "../../public"),
    plugins: [
        liveDevicePreview(),
        tsconfigPaths({ projects: [path.resolve(__dirname, "../../tsconfig.json")] }),
        svgr({
            svgrOptions: { exportType: "default", ref: true, svgo: false, titleProp: true },
            include: "**/*.svg",
        }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            "@hermes/plugin-sdk": path.resolve(__dirname, "../hermes/sdk/index.ts"),
            "@hermes/shared": path.resolve(__dirname, "../hermes-shared"),
            "@hermes": path.resolve(__dirname, "../hermes"),
        },
    },
    build: {
        minify: false,
        // novnc (imported via the sandbox preview) uses top-level await,
        // which the default es2020 "modules" target rejects during pre-bundling.
        target: "esnext",
    },
    esbuild: {
        target: "esnext",
    },
    optimizeDeps: {
        esbuildOptions: {
            target: "esnext",
        },
    },
    server: {
        port: 7007,
    },
});
