// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../public/pen/", import.meta.url);
const files = ["editor/index.html", "editor/kronos-host.js", "web/index.html", "skills/SKILL.md", "skills/execute.md", "provenance.json", "web/_next/static/media/emscripten-module.a7a23854.wasm"];
try {
    await Promise.all(files.map((file) => access(new URL(file, root))));
    const source = await readFile(new URL("web/index.html", root), "utf8");
    for (const match of source.matchAll(/(?:src|href)="(\.\/_next\/[^"?]+)(?:\?[^\"]*)?"/g)) {
        await access(new URL(match[1], new URL("web/", root)));
    }
    console.log("Pen editor runtime and entry assets verified.");
} catch (error) {
    throw new Error(`The actual Pen editor is missing or incomplete at ${fileURLToPath(root)}. Run npm run stage:pen -- /path/to/extracted/app.asar /path/to/saved/app.pen.dev before building. ${error.message}`);
}
