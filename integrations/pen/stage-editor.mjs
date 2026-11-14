// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = process.argv[2] || process.env.KRONOS_PEN_SOURCE;
if (!source) throw new Error("Provide the extracted Pen app.asar folder and the saved app.pen.dev web folder.");
const app = resolve(source);
const web = resolve(process.argv[3] || join(app, "../../../web/files/app.pen.dev"));
const output = resolve(root, "public/pen");
await rm(join(output, "editor"), { recursive: true, force: true });
await mkdir(join(output, "editor"), { recursive: true });
await cp(web, join(output, "web"), { recursive: true });
await cp(join(app, "out/skills/pen-dev"), join(output, "skills"), { recursive: true });
for (const entry of await readdir(join(output, "web"), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || ![".js", ".css", ".html"].includes(extname(entry.name))) continue;
  const path = join(entry.parentPath, entry.name);
  const original = await readFile(path, "utf8");
  let updated = original
    .replaceAll("/_next/", "./_next/")
    .replaceAll("/skills/pen-dev/", "../skills/")
    .replaceAll("/images/", "./images/")
    .replace(/\$\{[A-Za-z]+\}images\//g, "./images/");
  if (extname(entry.name) === ".css") updated = updated.replaceAll("./_next/static/media/", "../media/");
  if (updated !== original) await writeFile(path, updated);
}
await cp(
  join(app, "out/editor/assets/emscripten-module-B1g2L2eS.wasm"),
  join(output, "web/_next/static/media/emscripten-module.a7a23854.wasm")
);
await cp(join(here, "editor-host.js"), join(output, "editor/kronos-host.js"));
await writeFile(
  join(output, "editor/index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe id="pen-editor" name="kronos-pen-engine" title="Pen design editor" allow="clipboard-read; clipboard-write" src="../web/index.html?embed"></iframe><script src="./kronos-host.js"></script></body></html>'
);
await writeFile(join(output, ".gitignore"), "*\n");
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      product: "Pen",
      desktopVersion: "1.2.23",
      desktopSource: app,
      webSource: web,
      stagedAt: new Date().toISOString(),
      modified: [
        "Web asset paths rebased relative to embedded document; skills served from sibling folder",
        "KronOS embed wrapper added",
      ],
      note: "Official anonymous web embed and shipped desktop skills. No authentication or billing code modified. Local vendor runtime; not original source or a redistribution license.",
    },
    null,
    2
  )
);
console.log(`Staged actual Pen web editor at ${output}`);
