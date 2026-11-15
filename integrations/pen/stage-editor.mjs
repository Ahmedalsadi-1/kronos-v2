// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchPenRuntime } from "./patch-runtime.mjs";
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
await mkdir(join(output, "libraries"), { recursive: true });
await mkdir(join(output, "web/images"), { recursive: true });
for (const name of ["shadcn", "lunaris", "halo", "nitro"]) {
  await cp(join(app, `out/data/${name}.lib.pen`), join(output, `libraries/${name}.lib.pen`));
  await cp(join(app, `out/editor/images/design-kit-${name}.png`), join(output, `web/images/design-kit-${name}.png`));
}
await cp(join(app, "out/editor/goodies"), join(output, "web/goodies"), { recursive: true });
await cp(join(app, "out/editor/images/styles"), join(output, "web/images/styles"), { recursive: true });
await cp(join(app, "out/editor/images/design-kit-new.png"), join(output, "web/images/design-kit-new.png"));
await mkdir(join(output, "web/goodies/templates"), { recursive: true });
for (const name of ["shadcn", "lunaris", "halo", "nitro", "demo", "heroui"]) {
  await cp(join(app, `out/data/pencil-${name}.pen`), join(output, `web/goodies/templates/pencil-${name}.pen`));
  await cp(join(app, `out/editor/images/design-kit-${name}.png`), join(output, `web/images/design-kit-${name}.png`));
}
let goodiesBridgeCount = 0;
let cameraBridgeCount = 0;
let commandsBridgeCount = 0;
let previewBridgeCount = 0;
let slidesBridgeCount = 0;
let agentDispatchCount = 0;
let agentComposerCount = 0;
let miniChatCount = 0;
let chatHistoryCount = 0;
let libraryTabsCount = 0;
let workspaceDashboardCount = 0;
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
  if (extname(entry.name) === ".js") {
    const patched = patchPenRuntime(updated);
    updated = patched.source;
    if (patched.goodiesPatched) goodiesBridgeCount++;
    if (patched.patched) cameraBridgeCount++;
    if (patched.commandsPatched) commandsBridgeCount++;
    if (patched.previewsPatched) previewBridgeCount++;
    if (patched.slidesPatched) slidesBridgeCount++;
    if (patched.agentDispatchPatched) agentDispatchCount++;
    if (patched.agentComposerPatched) agentComposerCount++;
    if (patched.miniChatPatched) miniChatCount++;
    if (patched.chatHistoryPatched) chatHistoryCount++;
    if (patched.libraryTabsPatched) libraryTabsCount++;
    if (patched.workspaceDashboardPatched) workspaceDashboardCount++;
  }
  if (updated !== original) await writeFile(path, updated);
}
if (goodiesBridgeCount !== 2) throw new Error("Expected the Pen Goodies dialog and template paste patches.");
if (cameraBridgeCount !== 1)
  throw new Error(
    `Expected one Pen camera bridge, found ${cameraBridgeCount}. Review this vendor version before staging.`
  );
if (commandsBridgeCount !== 1 || previewBridgeCount !== 1)
  throw new Error(`Expected native command/preview bridges, found ${commandsBridgeCount}/${previewBridgeCount}.`);
if (slidesBridgeCount !== 1)
  throw new Error(`Expected one Pen slide frame check, found ${slidesBridgeCount}.`);
if (agentDispatchCount !== 1 || agentComposerCount !== 1)
  throw new Error(`Expected native agent dispatch/composer bridges, found ${agentDispatchCount}/${agentComposerCount}.`);
if (miniChatCount !== 1) throw new Error(`Expected one Pen mini chat patch, found ${miniChatCount}.`);
if (workspaceDashboardCount !== 1) throw new Error("Expected one Pen workspace dashboard patch.");
if (libraryTabsCount !== 1) throw new Error(`Expected one Pen library tabs patch, found ${libraryTabsCount}.`);
if (chatHistoryCount !== 1) throw new Error(`Expected one Pen chat history patch, found ${chatHistoryCount}.`);
await cp(
  join(app, "out/editor/assets/emscripten-module-B1g2L2eS.wasm"),
  join(output, "web/_next/static/media/emscripten-module.a7a23854.wasm")
);
const host = await Promise.all(
  ["widget-host.js", "commands-host.js", "settings-host.js", "shell-host.js", "editor-host.js"].map((name) =>
    readFile(join(here, name), "utf8")
  )
);
await writeFile(join(output, "editor/kronos-host.js"), host.join("\n"));
await writeFile(
  join(output, "editor/index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe id="pen-editor" name="kronos-pen-engine" title="Pen design editor" allow="clipboard-read; clipboard-write" src="../web/index.html?embed&amp;kronos-chat"></iframe><script src="./kronos-host.js"></script></body></html>'
);
await writeFile(join(output, ".gitignore"), "*\n");
await writeFile(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      product: "Pen",
      desktopVersion: "1.2.23",
      goodiesBridgeVersion: 1,
      cameraBridgeVersion: 2,
      slidesBridgeVersion: 1,
      shellBridgeVersion: 1,
      agentBridgeVersion: 1,
      desktopSource: app,
      webSource: web,
      stagedAt: new Date().toISOString(),
      modified: [
        "Web asset paths rebased relative to embedded document; skills served from sibling folder",
        "KronOS embed wrapper added",
        "Version-checked scene setup hook exposes the native camera to the local KronOS wrapper",
        "Native chat routes through KronOS Agent when its local bridge is present",
      ],
      note: "Official anonymous web embed and shipped desktop skills. Local vendor runtime; not original source or a redistribution license.",
    },
    null,
    2
  )
);
console.log(`Staged actual Pen web editor at ${output}`);
