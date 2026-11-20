// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawn, spawnSync } from "node:child_process";
import console from "node:console";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import YAML from "yaml";

const Root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const Package = require("../package.json");
const args = process.argv.slice(2);
const production = args.includes("--production");
const adhoc = process.env.KRONOS_ADHOC_BUILD === "1";

async function verifyReleaseArtifacts(output, app) {
  const base = `${Package.productName}-darwin-arm64-${Package.version}`;
  const zip = `${base}.zip`;
  const dmg = `${base}.dmg`;
  const updaterConfig = YAML.parse(await readFile(path.join(app, "Contents/Resources/app-update.yml"), "utf8"));
  const updateFile = `${updaterConfig.channel ?? "latest"}-mac.yml`;
  const metadata = YAML.parse(await readFile(path.join(output, updateFile), "utf8"));
  if (metadata.version !== Package.version) {
    throw new Error("macOS update metadata does not match the packaged version.");
  }
  const checksums = [];
  for (const name of [dmg, zip, `${dmg}.blockmap`, `${zip}.blockmap`, updateFile]) {
    const file = path.join(output, name);
    const sha256 = createHash("sha256");
    const sha512 = name === zip ? createHash("sha512") : null;
    for await (const chunk of createReadStream(file)) {
      sha256.update(chunk);
      sha512?.update(chunk);
    }
    if (sha512) {
      const entry = metadata.files?.find((item) => item.url === name);
      if (entry?.sha512 !== sha512.digest("base64") || entry?.size !== (await stat(file)).size) {
        throw new Error("macOS update metadata does not match the packaged ZIP.");
      }
    }
    checksums.push(`${sha256.digest("hex")}  ${name}`);
  }
  await writeFile(path.join(output, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
}

if (production) {
  if (process.platform !== "darwin" || adhoc || args.length !== 1) {
    throw new Error("Use --production by itself on macOS to build signed Apple silicon installers.");
  }
  const identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  if (!/\b[0-9A-F]{40} "Developer ID Application: /i.test(identities)) {
    throw new Error("Production packaging requires a valid Apple Developer ID Application identity in Keychain.");
  }
  execFileSync("lipo", [path.join(Root, "agents/kronoscode/bin/kronoscode"), "-verify_arch", "arm64"]);
}

const productionRoot = path.join(Root, "make/kronos-production");
const Stage = await mkdtemp(path.join(os.tmpdir(), "kronos-package-"));
let productionOutput;
let verified = false;
try {
  if (production) {
    await mkdir(productionRoot, { recursive: true });
    productionOutput = await mkdtemp(path.join(productionRoot, `${Package.version}-`));
  }
  // Vite bundles runtime dependencies. Scanning the development workspace adds no runtime files and can exhaust memory.
  await writeFile(
    path.join(Stage, "package.json"),
    JSON.stringify(
      {
        name: Package.name,
        productName: Package.productName,
        version: Package.version,
        description: Package.description,
        homepage: Package.homepage,
        private: true,
        type: "module",
        main: Package.main,
      },
      null,
      4
    )
  );
  const configPath = path.join(Stage, "electron-builder.cjs");
  await writeFile(
    configPath,
    `
const path = require("node:path");
const root = ${JSON.stringify(Root)};
const config = require(path.join(root, "electron-builder.config.cjs"));
config.electronVersion = require(path.join(root, "node_modules/electron/package.json")).version;
config.files = config.files.map((entry) => typeof entry === "string" ? entry : ({ ...entry, from: entry.from === "." ? __dirname : path.resolve(root, entry.from) }));
config.extraResources = config.extraResources.map((entry) => ({ ...entry, from: path.resolve(root, entry.from) }));
for (const platform of ["mac", "linux", "win"]) {
  if (config[platform]?.extraResources) {
    config[platform].extraResources = config[platform].extraResources.map((entry) => ({ ...entry, from: path.resolve(root, entry.from) }));
  }
}
config.directories = { ...config.directories, buildResources: path.join(root, "build"), output: ${JSON.stringify(productionOutput ?? path.join(Root, "make/kronos"))} };
config.mac = { ...config.mac, icon: path.resolve(root, config.mac.icon), entitlements: path.resolve(root, config.mac.entitlements), entitlementsInherit: path.resolve(root, config.mac.entitlementsInherit) };
if (${production}) {
  config.mac = { ...config.mac, forceCodeSigning: true, hardenedRuntime: true, notarize: true };
  config.dmg = { ...config.dmg, sign: true };
}
if (process.env.KRONOS_ADHOC_BUILD === "1") {
  config.mac = { ...config.mac, identity: "-", notarize: false };
  config.dmg = { ...config.dmg, sign: false };
}
config.appImage = { ...config.appImage, license: path.join(root, "LICENSE") };
config.deb = { ...config.deb, afterInstall: path.resolve(root, config.deb.afterInstall) };
module.exports = config;
`
  );
  const defaults = [
    process.platform === "darwin" ? "--mac" : process.platform === "win32" ? "--win" : "--linux",
    `--${process.arch}`,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=8192",
        require.resolve("electron-builder/out/cli/cli.js"),
        "--projectDir",
        Stage,
        "--config",
        configPath,
        "--publish",
        "never",
        ...(production ? ["--mac", "dmg", "zip", "--arm64"] : args.length ? args : defaults),
      ],
      // The signing tool scans cwd for provisioning profiles; keep it away from workspace symlinks.
      { cwd: Stage, stdio: "inherit", env: process.env }
    );
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`KronOS packaging failed (${signal ?? code})`))
    );
  });
  if (production) {
    const app = path.join(productionOutput, "mac-arm64", `${Package.productName}.app`);
    const signature = spawnSync("codesign", ["-dv", "--verbose=4", app], { encoding: "utf8" });
    if (signature.status !== 0 || !/^Authority=Developer ID Application: /m.test(signature.stderr)) {
      throw new Error("The packaged app must be signed with an Apple Developer ID Application identity.");
    }
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
    execFileSync("xcrun", ["stapler", "validate", app], { stdio: "inherit" });
    execFileSync("spctl", ["--assess", "--type", "execute", app], { stdio: "inherit" });
    const dmg = path.join(productionOutput, `${Package.productName}-darwin-arm64-${Package.version}.dmg`);
    execFileSync("codesign", ["--verify", "--strict", dmg], { stdio: "inherit" });
    await verifyReleaseArtifacts(productionOutput, app);
    verified = true;
    console.log(`Verified production artifacts in ${productionOutput}`);
  }
} finally {
  await rm(Stage, { recursive: true, force: true });
  if (productionOutput && !verified) await rm(productionOutput, { recursive: true, force: true });
}
