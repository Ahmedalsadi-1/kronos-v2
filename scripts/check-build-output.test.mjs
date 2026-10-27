import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const Script = fileURLToPath(new URL("./check-build-output.mjs", import.meta.url));

function fixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "kronterm-build-check-"));
  for (const relative of [
    "dist/mcp-kron-term/dist/index.js",
    "dist/mcp-kron-term/dist/native-bridge.js",
    "dist/mcp-kron-term/dist/native-proxy.js",
    "dist/hermes-plugins/kronterm-tools/plugin.yaml",
    "dist/frontend/assets/index.js",
  ]) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "fixture");
  }
  const check = (input = "") =>
    spawnSync(process.execPath, [Script], {
      cwd: root,
      input,
      encoding: "utf8",
      env: { ...process.env, KRONTERM_SOURCEMAP: "" },
    });
  try {
    run(root, check);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("checks actual chunk sizes without a build log", () =>
  fixture((root, check) => {
    truncateSync(path.join(root, "dist/frontend/assets/index.js"), 22_001_000);
    const result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /above the .* beta budget/);
  }));

test("reports large chunks even when stdin is empty", () =>
  fixture((root, check) => {
    truncateSync(path.join(root, "dist/frontend/assets/index.js"), 8_001_000);
    const result = check();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /keep it lazy-loaded/);
  }));

test("fails when renderer assets are missing", () =>
  fixture((root, check) => {
    rmSync(path.join(root, "dist/frontend/assets"), { recursive: true });
    const result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /renderer JavaScript assets/i);
  }));

test("retains packaging and circular dependency checks", () =>
  fixture((root, check) => {
    assert.equal(check().status, 0);
    assert.equal(check("circular dependency between chunks").status, 1);
    rmSync(path.join(root, "dist/mcp-kron-term/dist/native-proxy.js"));
    assert.match(check().stderr, /Required packaged runtime artifact is missing/);
  }));
