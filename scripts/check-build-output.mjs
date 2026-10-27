#!/usr/bin/env node

import console from "node:console";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MaxRendererChunkKb = 22000;
const LargeRendererChunkKb = 8000;

function globHasSourceMap(directory) {
  return readdirSync(directory, { recursive: true }).some((entry) => String(entry).endsWith(".map"));
}

function readInput() {
  const path = process.argv[2];
  if (path) {
    return readFileSync(path, "utf8");
  }
  if (process.stdin.isTTY) {
    return "";
  }
  return readFileSync(0, "utf8");
}

const log = readInput();
const failures = [];
const notices = [];

for (const requiredPath of [
  "dist/mcp-kron-term/dist/index.js",
  "dist/mcp-kron-term/dist/native-bridge.js",
  "dist/mcp-kron-term/dist/native-proxy.js",
  "dist/hermes-plugins/kronterm-tools/plugin.yaml",
]) {
  if (!existsSync(requiredPath)) {
    failures.push(`Required packaged runtime artifact is missing: ${requiredPath}`);
  }
}

if (!process.env.KRONTERM_SOURCEMAP) {
  const sourceMapPaths = ["dist/main", "dist/frontend", "dist/preload"];
  for (const sourceMapPath of sourceMapPaths) {
    if (existsSync(sourceMapPath) && globHasSourceMap(sourceMapPath)) {
      failures.push(`${sourceMapPath} contains production source maps without KRONTERM_SOURCEMAP=true.`);
    }
  }
}

if (/circular dependency between chunks|broken execution order/i.test(log)) {
  failures.push("Rollup reported circular chunks that may break execution order.");
}

const assetsDirectory = "dist/frontend/assets";
const chunks = existsSync(assetsDirectory)
  ? readdirSync(assetsDirectory, { recursive: true }).filter((file) => String(file).endsWith(".js"))
  : [];
if (chunks.length === 0) {
  failures.push("No renderer JavaScript assets found; build the renderer before checking output.");
}
for (const file of chunks) {
  const fileName = String(file);
  const sizeKb = statSync(path.join(assetsDirectory, fileName)).size / 1000;
  if (sizeKb > MaxRendererChunkKb) {
    failures.push(`${fileName} is ${sizeKb.toFixed(2)} kB, above the ${MaxRendererChunkKb} kB beta budget.`);
  } else if (sizeKb > LargeRendererChunkKb) {
    notices.push(`${fileName} is ${sizeKb.toFixed(2)} kB; keep it lazy-loaded or justify the startup cost.`);
  }
}

if (notices.length) {
  console.log("Build output notices:");
  for (const notice of notices) {
    console.log(`- ${notice}`);
  }
}

if (failures.length) {
  console.error("Build output failed release-readiness checks:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Build output passed release-readiness checks.");
