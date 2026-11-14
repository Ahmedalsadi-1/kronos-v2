// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import console from "node:console";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const Root = fileURLToPath(new URL("../", import.meta.url));
const Destination = path.join(Root, "dist/mcp-kron-term");
await mkdir(Destination, { recursive: true });
await build({
  absWorkingDir: Root,
  entryPoints: {
    index: "mcp-kron-term/src/index.ts",
    "native-bridge": "mcp-kron-term/src/native-bridge.ts",
    "native-proxy": "mcp-kron-term/src/native-proxy.ts",
  },
  outdir: path.join(Destination, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  banner: {
    js: 'import { createRequire as kronosCreateRequire } from "node:module"; const require = kronosCreateRequire(import.meta.url);',
  },
});
await writeFile(
  path.join(Destination, "package.json"),
  JSON.stringify(
    {
      name: "mcp-kron-term",
      version: "1.0.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
    },
    null,
    4
  ) + "\n"
);
const PluginDestination = path.join(Root, "dist/hermes-plugins/kronterm-tools");
await rm(PluginDestination, { recursive: true, force: true });
await cp(path.join(Root, "agents/hermes/plugins/kronterm-tools"), PluginDestination, {
  recursive: true,
  filter: (source) => !/(?:^|[/\\])(?:__pycache__|tests)(?:[/\\]|$)|\.pyc$/.test(source),
});
execFileSync(process.execPath, [path.join(Root, "scripts/build-kronos-agent-harness.mjs"), PluginDestination], {
  stdio: "inherit",
});
console.log("Staged current KronOS MCP and agent plugin runtimes.");
