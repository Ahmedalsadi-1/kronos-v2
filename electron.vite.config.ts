// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "electron-vite";
import path from "node:path";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";

// from our electron build
const CHROME = "chrome140";
const NODE = "node22";
const ProductionSourceMaps = process.env.KRONTERM_SOURCEMAP === "true" ? ("hidden" as const) : false;
const VscodeJsonRpcCommonPath = path.resolve(process.cwd(), "node_modules/vscode-jsonrpc/lib/common");

export default defineConfig({
    main: {
        root: ".",
        build: {
            target: NODE,
            sourcemap: ProductionSourceMaps,
            rollupOptions: {
                input: {
                    index: "emain/emain.ts",
                },
            },
            outDir: "dist/main",
            externalizeDeps: false,
        },
        plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
        resolve: {
            alias: {
                "@": "frontend",
            },
        },
        server: {
            open: false,
        },
        define: {
            "process.env.WS_NO_BUFFER_UTIL": "true",
            "process.env.WS_NO_UTF_8_VALIDATE": "true",
            "process.env.KRONOS_SUPABASE_URL": JSON.stringify(process.env.KRONOS_SUPABASE_URL ?? ""),
            "process.env.KRONOS_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.KRONOS_SUPABASE_PUBLISHABLE_KEY ?? ""),
        },
    },
    preload: {
        root: ".",
        build: {
            target: NODE,
            sourcemap: ProductionSourceMaps,
            rollupOptions: {
                input: {
                    index: "emain/preload.ts",
                    "preload-webview": "emain/preload-webview.ts",
                    "preload-pet": "emain/preload-pet.ts",
                    "preload-overlay": "emain/preload-overlay.ts",
                    "startup-onboarding": "emain/preload-startup-onboarding.ts",
                    "kronos-signin": "emain/preload-kronos-signin.ts",
                },
                output: {
                    format: "cjs",
                },
            },
            outDir: "dist/preload",
            externalizeDeps: false,
        },
        server: {
            open: false,
        },
        plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
    },
    renderer: {
        base: "./",
        root: ".",
        cacheDir: "node_modules/.vite/kronterm-renderer",
        build: {
            target: CHROME,
            sourcemap: ProductionSourceMaps,
            outDir: "dist/frontend",
            rollupOptions: {
                input: {
                    index: "index.html",
                    pet: "pet.html",
                    overlay: "overlay.html",
                    signin: "signin.html",
                    "selector-toolbar": "selector-toolbar.html",
                },
                output: {
                    manualChunks(id) {
                        // A shared loader in an optional chunk makes that entire chunk eager.
                        if (id === "\0vite/preload-helper.js") return "preload-helper";
                        const p = id.replace(/\\/g, "/");
                        if (p.includes("node_modules/monaco") || p.includes("node_modules/@monaco")) return "monaco";
                        if (p.includes("node_modules/mermaid") || p.includes("node_modules/@mermaid")) return "mermaid";
                        if (p.includes("node_modules/katex") || p.includes("node_modules/@katex")) return "katex";
                        if (p.includes("node_modules/shiki") || p.includes("node_modules/@shiki")) {
                            return "shiki";
                        }
                        if (p.includes("node_modules/cytoscape") || p.includes("node_modules/@cytoscape"))
                            return "cytoscape";
                        return undefined;
                    },
                },
            },
        },
        optimizeDeps: {
            // Hermes mounts lazily; discovering these after first render invalidates imports already in flight.
            include: [
                "monaco-yaml/yaml.worker.js",
                "react",
                "react-dom/client",
                "@radix-ui/react-dialog",
                "@assistant-ui/react",
                "@assistant-ui/react-streamdown",
                "@dnd-kit/core",
                "@dnd-kit/sortable",
                "dompurify",
                "ignore",
                "rehype-raw",
            ],
            exclude: ["langium"],
            esbuildOptions: {
                target: CHROME,
            },
        },
        resolve: {
            dedupe: ["react", "react-dom"],
            alias: [
                {
                    find: /^@hermes\/shared\/(.*)/,
                    replacement: path.resolve(process.cwd(), "frontend/hermes-shared/$1"),
                },
                {
                    find: /^@hermes\/shared$/,
                    replacement: path.resolve(process.cwd(), "frontend/hermes-shared/index.ts"),
                },
                {
                    find: /^@hermes\/plugin-sdk$/,
                    replacement: path.resolve(process.cwd(), "frontend/hermes/sdk/index.ts"),
                },
                { find: /^@hermes\/(.*)/, replacement: path.resolve(process.cwd(), "frontend/hermes/$1") },
                { find: /^@hermes$/, replacement: path.resolve(process.cwd(), "frontend/hermes/index.ts") },
                { find: /^bippy$/, replacement: path.resolve(process.cwd(), "frontend/hermes/debug/bippy.d.ts") },
                {
                    find: "vscode-jsonrpc/lib/common/cancellation.js",
                    replacement: path.join(VscodeJsonRpcCommonPath, "cancellation.js"),
                },
                {
                    find: "vscode-jsonrpc/lib/common/events.js",
                    replacement: path.join(VscodeJsonRpcCommonPath, "events.js"),
                },
            ],
        },
        server: {
            open: false,
            port: 9124,
            strictPort: true,
            watch: {
                ignored: [
                    "**/third_party/**",
                    "**/integrations/n8n/upstream/**",
                    "**/integrations/comfyui/upstream/**",
                    "**/public/comfy-native/**",
                    "**/public/pen/**",
                    "**/vendor/**",
                    "**/kronoscoder/**",
                    "**/UI-TARS-desktop/**",
                    "**/.local/**",
                    "**/.git/**",
                    "**/.hermes/**",
                    "**/__pycache__/**",
                    "**/.venv/**",
                    "**/dist/**",
                    "**/*.go",
                    "**/go.mod",
                    "**/go.sum",
                    "**/*.md",
                    "**/*.mdx",
                    "**/*.json",
                    "**/emain/**",
                    "**/*.txt",
                    "**/*.log",
                    "**/*.tsbuildinfo",
                    "**/test-results.xml",
                    "**/*.test.ts",
                    "**/*.test.tsx",
                    "**/*.test.mjs",
                    "**/.tmp/**",
                ],
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    silenceDeprecations: ["mixed-decls"],
                },
            },
        },
        plugins: [
            tsconfigPaths({ ignoreConfigErrors: true }),
            { ...ViteImageOptimizer(), apply: "build" },
            svgr({
                svgrOptions: { exportType: "default", ref: true, svgo: false, titleProp: true },
                include: "**/*.svg",
            }),
            react({ exclude: [/node_modules/, /\/frontend\/(?:signin|app\/components\/ui\/modern-stunning-sign-in)\.tsx$/] }),
            tailwindcss(),
        ],
    },
});
