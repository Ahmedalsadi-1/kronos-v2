// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DefaultComfyOrigin } from "../frontend/types/comfyui";
import { ComfyUiClient } from "./comfyui-client";
import { getWaveDataDir } from "./emain-platform";

let client: ComfyUiClient;
let renderChild: ChildProcess;
let renderStartup: Promise<void>;
let renderStartupController: AbortController;

export function getComfyUiClient(): ComfyUiClient {
    return (client ??= new ComfyUiClient(path.join(getWaveDataDir(), "images", "journal.json")));
}

function renderInstallation() {
    const bundled = process.resourcesPath && path.join(process.resourcesPath, "kronrender");
    const installed =
        process.platform === "darwin" ? "/Applications/ComfyUI.app/Contents/Resources/ComfyUI" : undefined;
    const root =
        process.env.KRONOS_RENDER_ROOT || (bundled && existsSync(path.join(bundled, "main.py")) ? bundled : installed);
    const managedHome = path.join(os.homedir(), ".kronterm", "runtimes", "render");
    let desktopHome: string;
    if (installed) {
        try {
            const config = path.join(os.homedir(), "Library", "Application Support", "ComfyUI", "config.json");
            const basePath = JSON.parse(readFileSync(config, "utf8")).basePath;
            if (typeof basePath === "string" && path.isAbsolute(basePath)) desktopHome = basePath;
        } catch {
            // The desktop installation can be absent or unfinished.
        }
    }
    const pythonPath = (folder: string) =>
        path.join(folder, ".venv", ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]));
    const python = [
        process.env.KRONOS_RENDER_PYTHON,
        pythonPath(managedHome),
        desktopHome && pythonPath(desktopHome),
    ].find((candidate) => candidate && path.isAbsolute(candidate) && existsSync(candidate));
    if (!root || !path.isAbsolute(root) || !existsSync(path.join(root, "main.py")) || !python) {
        throw new Error(
            "KronRender needs a local render runtime. Configure it or connect to an existing local engine."
        );
    }
    const base = process.env.KRONOS_RENDER_HOME || (desktopHome && existsSync(desktopHome) ? desktopHome : managedHome);
    if (!path.isAbsolute(base)) throw new Error("KronRender requires an absolute data directory.");
    return { root, python, base };
}

async function renderIsReady(signal: AbortSignal) {
    try {
        const response = await fetch(`${DefaultComfyOrigin}/system_stats`, {
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        });
        if (!response.ok) {
            await response.body?.cancel();
            return false;
        }
        return typeof (await response.json())?.system === "object";
    } catch {
        return false;
    }
}

export function ensureKronRender(): Promise<void> {
    if (renderStartup) return renderStartup;
    const controller = new AbortController();
    renderStartupController = controller;
    const { signal } = controller;
    const startup = (async () => {
        if (await renderIsReady(signal)) return;
        signal.throwIfAborted();
        if (!renderChild) {
            const { root, python, base } = renderInstallation();
            const userDirectory = path.join(base, "user");
            mkdirSync(userDirectory, { recursive: true, mode: 0o700 });
            mkdirSync(path.join(base, "custom_nodes"), { recursive: true, mode: 0o700 });
            const frontend = path.join(root, "web_custom_versions", "desktop_app");
            const child = spawn(
                python,
                [
                    path.join(root, "main.py"),
                    "--listen",
                    "127.0.0.1",
                    "--port",
                    new URL(DefaultComfyOrigin).port,
                    "--base-directory",
                    base,
                    "--user-directory",
                    userDirectory,
                    "--disable-auto-launch",
                    "--database-url",
                    `sqlite:///${path.join(userDirectory, "comfyui.db")}`,
                    ...(existsSync(path.join(frontend, "index.html")) ? ["--front-end-root", frontend] : []),
                    ...(process.env.KRONOS_RENDER_CPU === "1" ? ["--cpu"] : []),
                ],
                { cwd: root, stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
            );
            renderChild = child;
            const released = () => {
                if (renderChild === child) renderChild = null;
            };
            child.once("error", released);
            child.once("exit", released);
            child.stderr?.resume();
        }
        const child = renderChild;
        const deadline = Date.now() + 900_000;
        while (child === renderChild && Date.now() < deadline) {
            await delay(250, undefined, { signal });
            if (await renderIsReady(signal)) return;
        }
        if (await renderIsReady(signal)) return;
        throw new Error("KronRender did not become ready. Check its local runtime and port 8188.");
    })();
    renderStartup = startup;
    void startup
        .finally(() => {
            if (renderStartup === startup) renderStartup = null;
            if (renderStartupController === controller) renderStartupController = null;
        })
        .catch(() => {});
    return startup;
}

export function stopKronRender(): void {
    renderStartupController?.abort();
    renderChild?.kill();
    renderChild = null;
}
