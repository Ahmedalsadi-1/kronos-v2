// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
if (process.platform !== "darwin") throw new Error("Building the macOS desktop picker requires macOS");
const architecture = process.argv[2] ?? process.arch;
if (!["arm64", "x64"].includes(architecture)) throw new Error("Unsupported desktop picker architecture");
const helper = process.argv[3] ?? "desktop-picker";
if (!["desktop-picker", "background-computer", "background-display"].includes(helper))
  throw new Error("Unsupported native helper");
const output = path.resolve(`dist/native/${helper}`);
const temporary = await mkdtemp(path.join(tmpdir(), "kronterm-picker-build-"));
try {
  await mkdir(path.dirname(output), { recursive: true });
  if (helper === "background-display") {
    await execute("/usr/bin/xcrun", [
      "clang",
      "-fobjc-arc",
      "-fblocks",
      "-arch",
      architecture === "x64" ? "x86_64" : "arm64",
      "-mmacosx-version-min=15.0",
      "-framework",
      "AppKit",
      "-framework",
      "CoreGraphics",
      "native/background-display.m",
      "-o",
      output,
    ]);
    await execute("/usr/bin/codesign", ["--force", "--sign", "-", output]);
    console.log(output);
    process.exitCode = 0;
  } else {
    const developer = (await execute("/usr/bin/xcode-select", ["-p"])).stdout.trim();
    const oldMap = path.join(developer, "usr/include/swift/module.modulemap");
    const newMap = path.join(developer, "usr/include/swift/bridging.modulemap");
    const args = [
      "-explicit-module-build",
      "-j",
      "4",
      "-target",
      `${architecture === "x64" ? "x86_64" : "arm64"}-apple-macosx15.0`,
    ];
    const olderSdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";
    const sdk = existsSync(olderSdk) ? olderSdk : (await execute("/usr/bin/xcrun", ["--show-sdk-path"])).stdout.trim();
    args.push("-sdk", sdk);
    if (existsSync(oldMap) && existsSync(newMap) && (await readFile(oldMap, "utf8")).includes("module SwiftBridging")) {
      const emptyMap = path.join(temporary, "empty.modulemap");
      const overlay = path.join(temporary, "overlay.json");
      await writeFile(emptyMap, "");
      await writeFile(
        overlay,
        JSON.stringify({ version: 0, roots: [{ type: "file", name: oldMap, "external-contents": emptyMap }] })
      );
      args.push("-vfsoverlay", overlay);
    }
    if (helper === "background-computer") args.push("-parse-as-library");
    await execute("/usr/bin/swiftc", [...args, `native/${helper}.swift`, "-o", output], {
      timeout: helper === "background-computer" ? 600_000 : 120_000,
    });
    await execute("/usr/bin/codesign", ["--force", "--sign", "-", output]);
    console.log(output);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
