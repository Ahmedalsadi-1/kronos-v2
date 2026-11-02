import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";

const Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export default defineConfig({
    root: path.join(Root, "prototypes/tauri-os"),
    publicDir: path.join(Root, "public"),
    plugins: [
        {
            name: "prototype-browser-host",
            enforce: "pre",
            transform(code, id) {
                if (id.endsWith("/frontend/app/modals/modalsrenderer.tsx")) {
                    return code.replaceAll("!clientData.tosagreed", "false");
                }
                if (!id.endsWith("/frontend/app/view/webview/webview.tsx")) return;
                return code.replace(/<webview\b/g, "<kronterm-webview").replace(/<\/webview>/g, "</kronterm-webview>");
            },
        },
        tsconfigPaths({ projects: [path.join(Root, "tsconfig.json")] }),
        svgr({ svgrOptions: { exportType: "default", ref: true, svgo: false, titleProp: true }, include: "**/*.svg" }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            ...Object.fromEntries(
                Object.entries(
                    JSON.parse(fs.readFileSync(path.join(Root, "tsconfig.json"), "utf8")).compilerOptions.paths
                )
                    .filter(([key]) => key.startsWith("@/"))
                    .map(([key, values]) => [
                        key.replace("/*", ""),
                        path.join(Root, (values as string[])[0].replace("/*", "")),
                    ])
            ),
            "@hermes/plugin-sdk": path.join(Root, "frontend/hermes/sdk/index.ts"),
            "@hermes/shared": path.join(Root, "frontend/hermes-shared"),
            "@hermes": path.join(Root, "frontend/hermes"),
        },
    },
    optimizeDeps: { esbuildOptions: { target: "esnext" } },
    esbuild: { target: "esnext" },
    build: {
        outDir: "web-dist",
        target: "safari16",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id === "\0vite/preload-helper.js") return "preload-helper";
                    const name = id.replaceAll("\\", "/");
                    for (const chunk of ["monaco", "mermaid", "katex", "shiki"]) {
                        if (name.includes(`node_modules/${chunk}`) || name.includes(`node_modules/@${chunk}`))
                            return chunk;
                    }
                },
            },
        },
    },
    css: { preprocessorOptions: { scss: { silenceDeprecations: ["mixed-decls"] } } },
});
