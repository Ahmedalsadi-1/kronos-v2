// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as electron from "electron";
import * as child_process from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as path from "node:path";

const IconPixelSize = 96;
const ConversionConcurrency = 6;
const MaxCachedIcons = 512;

type CachedBundleIcon = {
    plistSignature: string;
    icnsPath: string;
    iconSignature: string;
    dataUrl: string;
};

const BundleIconCache = new Map<string, CachedBundleIcon>();
const PendingBundleIcons = new Map<string, Promise<string | undefined>>();

type IconConverter = (icnsPath: string, outPath: string) => Promise<void>;

function runSips(icnsPath: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        child_process.execFile(
            "sips",
            ["-s", "format", "png", "-Z", String(IconPixelSize), icnsPath, "--out", outPath],
            { timeout: 5_000 },
            (error) => (error ? reject(error) : resolve())
        );
    });
}

function readPlistJson(plistPath: string): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve) => {
        child_process.execFile(
            "plutil",
            ["-convert", "json", "-o", "-", plistPath],
            { timeout: 3_000, maxBuffer: 4 * 1024 * 1024 },
            (error, stdout) => {
                if (error) return resolve(undefined);
                try {
                    resolve(JSON.parse(stdout) as Record<string, unknown>);
                } catch {
                    resolve(undefined);
                }
            }
        );
    });
}

// Info.plist may name the icon without its extension; some bundles only ship asset catalogs (no .icns).
export async function resolveBundleIcnsPath(appPath: string): Promise<string | undefined> {
    const plist = await readPlistJson(path.join(appPath, "Contents", "Info.plist"));
    const candidates = [plist?.CFBundleIconFile, plist?.CFBundleIconName]
        .filter((value): value is string => typeof value === "string" && value !== "")
        .map((value) => (value.endsWith(".icns") ? value : `${value}.icns`));
    for (const candidate of candidates) {
        const icnsPath = path.join(appPath, "Contents", "Resources", candidate);
        if (fs.existsSync(icnsPath)) return icnsPath;
    }
    return undefined;
}

function fileSignature(stat: fs.Stats): string {
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
}

async function readBundleIcon(
    appPath: string,
    cacheDir: string,
    cacheKey: string,
    convert: IconConverter
): Promise<string | undefined> {
    const plistStat = await fs.promises.stat(path.join(appPath, "Contents", "Info.plist")).catch(() => undefined);
    if (plistStat == null) {
        BundleIconCache.delete(cacheKey);
        return undefined;
    }
    const plistSignature = fileSignature(plistStat);
    const previous = BundleIconCache.get(cacheKey);
    if (previous?.plistSignature === plistSignature) {
        const iconStat = await fs.promises.stat(previous.icnsPath).catch(() => undefined);
        if (iconStat != null && fileSignature(iconStat) === previous.iconSignature) {
            BundleIconCache.delete(cacheKey);
            BundleIconCache.set(cacheKey, previous);
            return previous.dataUrl;
        }
    }
    BundleIconCache.delete(cacheKey);
    const icnsPath = await resolveBundleIcnsPath(appPath);
    if (icnsPath == null) return undefined;
    const stat = await fs.promises.stat(icnsPath);
    const iconSignature = fileSignature(stat);
    const key = createHash("sha1").update(`${icnsPath}:${iconSignature}:${IconPixelSize}`).digest("hex");
    const cached = path.join(cacheDir, `${key}.png`);
    if (!fs.existsSync(cached)) {
        await convert(icnsPath, cached);
    }
    const image = electron.nativeImage.createFromPath(cached);
    if (image.isEmpty()) return undefined;
    const dataUrl = image.toDataURL();
    BundleIconCache.set(cacheKey, { plistSignature, icnsPath, iconSignature, dataUrl });
    if (BundleIconCache.size > MaxCachedIcons) {
        BundleIconCache.delete(BundleIconCache.keys().next().value);
    }
    return dataUrl;
}

// Workspace views can request the same artwork concurrently; share conversion and decoding work.
function bundleIconDataUrl(appPath: string, cacheDir: string, convert: IconConverter): Promise<string | undefined> {
    const cacheKey = JSON.stringify([cacheDir, appPath]);
    const pending = PendingBundleIcons.get(cacheKey);
    if (pending != null) return pending;
    const request = readBundleIcon(appPath, cacheDir, cacheKey, convert).finally(() => {
        PendingBundleIcons.delete(cacheKey);
    });
    PendingBundleIcons.set(cacheKey, request);
    return request;
}

async function genericIconDataUrl(appPath: string): Promise<string | undefined> {
    const icon = await electron.app.getFileIcon(appPath, { size: "normal" });
    return icon.isEmpty() ? undefined : icon.toDataURL();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

// macOS's getFileIcon hands back the generic app placeholder for bundles, so the real artwork
// comes from converting the bundle's .icns; getFileIcon stays as the fallback.
export async function loadNativeAppIcons(
    appPaths: string[],
    cacheDir: string,
    convert: IconConverter = runSips
): Promise<Record<string, string>> {
    fs.mkdirSync(cacheDir, { recursive: true });
    const entries = await mapWithConcurrency(appPaths, ConversionConcurrency, async (appPath) => {
        try {
            const dataUrl =
                (process.platform === "darwin" ? await bundleIconDataUrl(appPath, cacheDir, convert) : undefined) ??
                (await genericIconDataUrl(appPath));
            return dataUrl == null ? undefined : ([appPath, dataUrl] as const);
        } catch {
            return undefined;
        }
    });
    return Object.fromEntries(entries.filter((entry) => entry != null));
}
