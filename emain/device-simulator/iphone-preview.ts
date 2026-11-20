// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { getComputerTargetsRuntime } from "../computer-targets-runtime";

const readIPhonePreview = async () => {
    const response = await fetch("http://localhost:3200/", {
        redirect: "error",
        signal: AbortSignal.timeout(3000),
    });
    if (!response.ok || !response.body) throw new Error("The iPhone preview is unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let prefix = "";
    let targetId: string;
    try {
        while (prefix.length < 1024 * 1024) {
            const { done, value } = await reader.read();
            if (done) break;
            prefix += decoder.decode(value, { stream: true });
            const metadata = /<script>window\.__SIM_PREVIEW__=(\{[^<]*\});?<\/script>/.exec(prefix);
            if (metadata) {
                const device = JSON.parse(metadata[1]).device;
                if (typeof device === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(device))
                    targetId = device;
                break;
            }
        }
    } finally {
        await reader.cancel();
    }
    const target =
        targetId &&
        (await getComputerTargetsRuntime().list()).find(
            ({ id, kind }) => kind === "ios-simulator" && id.toLowerCase() === targetId.toLowerCase()
        );
    if (!target) throw new Error("Could not identify the simulator attached to the iPhone preview.");
    return target;
};
const startIPhonePreview = async (requestedId?: string) => {
    try {
        return await readIPhonePreview();
    } catch (error) {
        if (!(error instanceof TypeError) || (error.cause as NodeJS.ErrnoException)?.code !== "ECONNREFUSED")
            throw error;
    }
    const targets = (await getComputerTargetsRuntime().list()).filter(
        ({ kind, name, status }) => kind === "ios-simulator" && /^iPhone\b/i.test(name) && status !== "unavailable"
    );
    const target = requestedId
        ? targets.find(({ id }) => id === requestedId)
        : (targets.find(({ status }) => status === "booted") ?? targets[0]);
    if (!target) throw new Error("No iPhone simulator is available.");
    const entry = [
        join(process.cwd(), "node_modules", "serve-sim", "dist", "serve-sim.js"),
        fileURLToPath(new URL("../../node_modules/serve-sim/dist/serve-sim.js", import.meta.url)),
        join(process.resourcesPath, "serve-sim", "dist", "serve-sim.js"),
    ].find(existsSync);
    if (!entry) throw new Error("The bundled iPhone preview helper is unavailable.");
    if (target.status !== "booted") await getComputerTargetsRuntime().perform({ targetId: target.id, action: "boot" });
    const child = spawn(process.execPath, [entry, "--port", "3200", target.id], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "ignore",
    });
    let startupError: Error;
    child.once("error", (error) => {
        startupError = error;
    });
    child.unref();
    const stop = () => child.kill();
    app.once("before-quit", stop);
    child.once("exit", () => app.removeListener("before-quit", stop));
    for (let attempt = 0; attempt < 40 && child.exitCode == null && !startupError; attempt++) {
        try {
            return await readIPhonePreview();
        } catch {
            await delay(500);
        }
    }
    stop();
    throw startupError ?? new Error("The iPhone preview did not become ready on port 3200.");
};

let startup: ReturnType<typeof readIPhonePreview>;

export async function ensureIPhonePreview(targetId?: string) {
    const target = await (startup ??= startIPhonePreview(targetId).finally(() => {
        startup = undefined;
    }));
    if (targetId && target.id !== targetId) {
        throw new Error("Port 3200 is already previewing a different iPhone simulator.");
    }
    return target;
}
