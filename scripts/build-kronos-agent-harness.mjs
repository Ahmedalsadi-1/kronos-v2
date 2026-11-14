// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../agents/hermes/harness", import.meta.url));
const target = path.join(root, "target");
const filename = {
    darwin: "libkronos_agent_harness.dylib",
    linux: "libkronos_agent_harness.so",
    win32: "kronos_agent_harness.dll",
}[process.platform];
const destination = process.argv[2] ?? path.resolve("dist/hermes-plugins/kronterm-tools");
execFileSync("cargo", ["build", "--locked", "--release", "--target-dir", target], { cwd: root, stdio: "inherit" });
if (path.resolve(destination) !== path.join(target, "release")) {
    await mkdir(destination, { recursive: true });
    await copyFile(path.join(target, "release", filename), path.join(destination, filename));
}
