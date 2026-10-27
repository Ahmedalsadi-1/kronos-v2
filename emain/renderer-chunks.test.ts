// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { rollup } from "rollup";
import { expect, test } from "vitest";
import electronViteConfig from "../electron.vite.config";

test("the preload helper does not pull deferred syntax grammars into startup", async () => {
    const helper = "\0vite/preload-helper.js";
    const grammar = "/node_modules/shiki/index.js";
    const modules = {
        entry: `import { preload } from ${JSON.stringify(helper)}; export const load = () => preload(() => import(${JSON.stringify(grammar)}));`,
        [helper]: "export const preload = (load) => load();",
        [grammar]: `import { preload } from ${JSON.stringify(helper)}; export const highlight = () => preload(() => 'highlighted');`,
    };
    const bundle = await rollup({
        input: "entry",
        plugins: [
            { name: "startup-fixture", resolveId: (id) => (id in modules ? id : null), load: (id) => modules[id] },
        ],
    });
    try {
        const outputConfig = electronViteConfig.renderer.build.rollupOptions.output;
        if (Array.isArray(outputConfig)) throw new Error("Expected one renderer output");
        const { output } = await bundle.generate({ format: "es", manualChunks: outputConfig.manualChunks });
        const entry = output.find((item) => item.type === "chunk" && item.isEntry);
        expect(entry?.type).toBe("chunk");
        if (entry?.type !== "chunk") throw new Error("Missing fixture entry");
        const startup = entry.imports.map((file) => output.find((item) => item.fileName === file));
        expect(startup.some((item) => item?.type === "chunk" && grammar in item.modules)).toBe(false);
        expect(entry.dynamicImports).toHaveLength(1);
        const deferred = output.find((item) => item.fileName === entry.dynamicImports[0]);
        expect(deferred?.type === "chunk" && grammar in deferred.modules).toBe(true);
    } finally {
        await bundle.close();
    }
});
