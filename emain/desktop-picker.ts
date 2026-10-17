// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, clipboard, nativeImage, type WebContents } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DesktopGrabPayload, DesktopGrabResult } from "../frontend/types/desktop-grab";

export type { DesktopGrabPayload, DesktopGrabResult } from "../frontend/types/desktop-grab";

const execute = promisify(execFile);
const operations = new Map<number, { id: string; child?: ChildProcess }>();
let compilePromise: Promise<string>;

function redact(value: unknown): string {
    if (typeof value !== "string") return "";
    return value
        .slice(0, 2000)
        .replace(/\b(?:Bearer\s+)[\w.+/-]+/gi, "Bearer [redacted]")
        .replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

export function sanitizeDesktopGrabPayload(value: unknown): DesktopGrabPayload {
    const data = value as Record<string, any>;
    const bounds = data?.bounds;
    if (
        !bounds ||
        ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        bounds.width > 16384 ||
        bounds.height > 16384
    ) {
        throw new Error("Desktop picker returned invalid element bounds");
    }
    return {
        application: redact(data.application),
        bundleId: redact(data.bundleId),
        window: redact(data.window),
        role: redact(data.role),
        name: data.secure ? "[redacted]" : redact(data.name),
        value: data.secure ? "[redacted]" : redact(data.value),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    };
}

async function pickerExecutable(): Promise<string> {
    const source = app.isPackaged
        ? path.join(process.resourcesPath, "native/desktop-picker.swift")
        : path.resolve(app.getAppPath(), "native/desktop-picker.swift");
    const bundled = path.join(process.resourcesPath, "native/desktop-picker");
    if (app.isPackaged && existsSync(bundled)) return bundled;
    const contents = await readFile(source);
    const digest = createHash("sha256").update(contents).digest("hex").slice(0, 16);
    const executable = path.join(tmpdir(), `kronterm-desktop-picker-${digest}`);
    if (!existsSync(executable)) {
        const directory = await mkdtemp(path.join(tmpdir(), "kronterm-picker-build-"));
        try {
            const args = ["-explicit-module-build", "-j", "4"];
            const olderSdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";
            if (existsSync(olderSdk)) args.push("-sdk", olderSdk);
            const developer = (await execute("/usr/bin/xcode-select", ["-p"])).stdout.trim();
            const oldMap = path.join(developer, "usr/include/swift/module.modulemap");
            const newMap = path.join(developer, "usr/include/swift/bridging.modulemap");
            if (
                existsSync(oldMap) &&
                existsSync(newMap) &&
                (await readFile(oldMap, "utf8")).includes("module SwiftBridging")
            ) {
                const emptyMap = path.join(directory, "empty.modulemap");
                const overlay = path.join(directory, "swift-overlay.json");
                await writeFile(emptyMap, "");
                await writeFile(
                    overlay,
                    JSON.stringify({
                        version: 0,
                        roots: [{ type: "file", name: oldMap, "external-contents": emptyMap }],
                    })
                );
                args.push("-vfsoverlay", overlay);
            }
            await execute("/usr/bin/swiftc", [...args, source, "-o", executable], { timeout: 120_000 });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
    return executable;
}

export function cancelDesktopGrab(senderId: number): void {
    const operation = operations.get(senderId);
    operations.delete(senderId);
    operation?.child?.kill();
}

export async function beginDesktopGrab(sender: WebContents): Promise<DesktopGrabResult> {
    if (process.platform !== "darwin") throw new Error("Native desktop element selection currently requires macOS");
    cancelDesktopGrab(sender.id);
    const operation = { id: randomUUID(), child: undefined as ChildProcess };
    operations.set(sender.id, operation);
    const cancel = () => cancelDesktopGrab(sender.id);
    sender.once("destroyed", cancel);
    let directory: string;
    try {
        compilePromise ??= pickerExecutable().catch((error) => {
            compilePromise = undefined;
            throw error;
        });
        const executable = await compilePromise;
        if (operations.get(sender.id) !== operation) return { status: "cancelled" };
        const raw = await new Promise<string>((resolve, reject) => {
            let output = "";
            const child = spawn(executable, [], { stdio: ["ignore", "pipe", "ignore"] });
            operation.child = child;
            const timer = setTimeout(() => child.kill(), 65_000);
            child.stdout.on("data", (chunk: Buffer) => {
                output += chunk.toString("utf8");
                if (output.length > 32_768) child.kill();
            });
            child.once("error", (error) => {
                clearTimeout(timer);
                reject(error);
            });
            child.once("exit", () => {
                clearTimeout(timer);
                resolve(output);
            });
        });
        if (operations.get(sender.id) !== operation || sender.isDestroyed() || !raw.trim())
            return { status: "cancelled" };
        const result = JSON.parse(raw);
        if (result.error) throw new Error(String(result.error).slice(0, 300));
        if (result.cancelled) return { status: "cancelled" };
        const payload = sanitizeDesktopGrabPayload(result);
        const sensitive =
            result.secure ||
            result.screenshotSensitive ||
            /password|secret|token|api[_-]?key/i.test(payload.name) ||
            payload.value.includes("[redacted]");
        if (result.screenshotRequested && !sensitive) {
            directory = await mkdtemp(path.join(tmpdir(), "kronterm-grab-"));
            const file = path.join(directory, "element.png");
            const rect = payload.bounds;
            await execute(
                "/usr/sbin/screencapture",
                [
                    "-x",
                    "-R",
                    `${Math.round(rect.x)},${Math.round(rect.y)},${Math.ceil(rect.width)},${Math.ceil(rect.height)}`,
                    file,
                ],
                { timeout: 10_000 }
            );
            if (operations.get(sender.id) !== operation || sender.isDestroyed()) return { status: "cancelled" };
            const bytes = await readFile(file);
            if (bytes.length <= 4_000_000) {
                payload.screenshot = `data:image/png;base64,${bytes.toString("base64")}`;
                clipboard.writeImage(nativeImage.createFromBuffer(bytes));
            }
        } else {
            if (result.screenshotRequested && sensitive) payload.screenshotOmitted = "sensitive-content";
            clipboard.writeText(JSON.stringify(payload, null, 2));
        }
        return { status: "selected", payload };
    } finally {
        sender.removeListener("destroyed", cancel);
        if (operations.get(sender.id) === operation) operations.delete(sender.id);
        if (directory) await rm(directory, { recursive: true, force: true });
    }
}
