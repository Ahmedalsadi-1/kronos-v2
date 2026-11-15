// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../public/pen/", import.meta.url);
const files = [
  "editor/index.html",
  "editor/kronos-host.js",
  "web/index.html",
  "web/goodies/scripts/clock.js",
  "web/goodies/templates/pencil-shadcn.pen",
  "skills/SKILL.md",
  "skills/execute.md",
  "provenance.json",
  "web/_next/static/media/emscripten-module.a7a23854.wasm",
];
try {
  for (const name of ["shadcn", "lunaris", "halo", "nitro"]) {
    files.push(`libraries/${name}.lib.pen`, `web/images/design-kit-${name}.png`);
  }
  await Promise.all(files.map((file) => access(new URL(file, root))));
  const host = await readFile(new URL("editor/kronos-host.js", root), "utf8");
  for (const module of ["Widgets", "Commands", "Settings", "Shell"])
    if (!host.includes(`createKronosPen${module} =`)) throw new Error(`The Pen ${module} bridge needs staging.`);
  const provenance = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
  if (provenance.goodiesBridgeVersion !== 1) throw new Error("The Pen Goodies integration needs staging.");
  if (provenance.shellBridgeVersion !== 1) throw new Error("The Pen shell integration needs staging.");
  if (provenance.cameraBridgeVersion !== 2 || provenance.slidesBridgeVersion !== 1)
    throw new Error("The Pen runtime needs its camera and slides bridges staged.");
  if (provenance.agentBridgeVersion !== 1) throw new Error("The Pen runtime needs its native chat bridge staged.");
  const source = await readFile(new URL("web/index.html", root), "utf8");
  for (const match of source.matchAll(/(?:src|href)="(\.\/_next\/[^"?]+)(?:\?[^\"]*)?"/g)) {
    await access(new URL(match[1], new URL("web/", root)));
  }
  console.log("Pen editor runtime and entry assets verified.");
} catch (error) {
  throw new Error(
    `The actual Pen editor is missing or incomplete at ${fileURLToPath(root)}. Run npm run stage:pen -- /path/to/extracted/app.asar /path/to/saved/app.pen.dev before building. ${error.message}`
  );
}
