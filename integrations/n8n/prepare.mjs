// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, "source.json"), "utf8"));
const upstream = path.join(root, "upstream");
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("n8n requires Node.js 24 or newer.");
function run(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
run(
    "git",
    ["submodule", "update", "--init", "--depth", "1", "--", "integrations/n8n/upstream"],
    path.resolve(root, "../..")
);
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: upstream, encoding: "utf8" });
if (revision.stdout.trim() !== source.commit) throw new Error("n8n source revision does not match source.json.");
const space = fs.statfsSync(root);
if (space.bavail * space.bsize < 8 * 1024 ** 3)
    throw new Error("Free at least 8 GB before installing and building n8n.");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
run(npm, ["exec", "--yes", "--package=pnpm@12.4.2", "--", "pnpm", "install", "--frozen-lockfile"], upstream);
// pnpm's embedded Node can select a native binding that the desktop Node cannot load.
const requireNode = createRequire(path.join(upstream, "packages/nodes-base/package.json"));
const kafka = path.dirname(requireNode.resolve("@confluentinc/kafka-javascript/package.json"));
const installer = requireNode.resolve("@mapbox/node-pre-gyp/bin/node-pre-gyp", { paths: [kafka] });
run(process.execPath, [installer, "install"], kafka);
run(process.execPath, [path.join(root, "apply-editor-patches.mjs")], root);
run(npm, ["exec", "--yes", "--package=pnpm@12.4.2", "--", "pnpm", "build"], upstream);

run(process.execPath, [path.join(root, "build-native-editor.mjs")], root);
