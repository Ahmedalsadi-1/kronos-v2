// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin" || (process.argv[2] ?? process.arch) !== "arm64") process.exit(0);

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = resolve(root, "native/vm-process/Cargo.toml");
const target = resolve(root, "native/vm-process/target");
const destination = resolve(root, "dist/native/vm-process.node");
const triple = "aarch64-apple-darwin";
execFileSync(
    "cargo",
    [
        "rustc", "--manifest-path", manifest, "--locked", "--release", "--target-dir", target,
        "--target", triple, "--", "-C", "link-arg=-Wl,-undefined,dynamic_lookup",
    ],
    { stdio: "inherit" }
);
mkdirSync(dirname(destination), { recursive: true });
// Replacing the inode avoids a stale macOS code-signature cache entry after rebuilding.
const staging = mkdtempSync(resolve(dirname(destination), ".vm-process-"));
try {
    const addon = resolve(staging, "vm-process.node");
    copyFileSync(resolve(target, triple, "release/libkronos_vm_process.dylib"), addon);
    renameSync(addon, destination);
} finally {
    rmSync(staging, { recursive: true, force: true });
}
