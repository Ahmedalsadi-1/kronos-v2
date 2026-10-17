// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ComputerTarget, ComputerTargetAction, ComputerTargetSnapshot } from "../frontend/types/computer-targets";

const MaxResponseBytes = 28 * 1024 * 1024;
const SessionIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export function validateAppiumUrl(value: string): string {
    const url = new URL(value);
    if (
        url.protocol !== "http:" ||
        !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            "KRONTERM_APPIUM_URL must be an HTTP loopback endpoint without credentials or query parameters."
        );
    }
    if (url.pathname !== "/" && url.pathname !== "/wd/hub" && url.pathname !== "/wd/hub/") {
        throw new Error("Appium supports only / or /wd/hub as the server base path.");
    }
    // Avoid DNS resolution changing a configured local-only endpoint.
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.toString().replace(/\/$/, "");
}

export function parseAppiumTargets(value: unknown): ComputerTarget[] {
    if (!Array.isArray(value)) throw new Error("Appium returned an invalid session list.");
    return value.flatMap((session) => {
        const capabilities = session?.capabilities;
        if (!SessionIdPattern.test(session?.id ?? "") || !capabilities || typeof capabilities !== "object") return [];
        const platform = String(capabilities.platformName ?? "").toLowerCase();
        const driver = String(capabilities["appium:automationName"] ?? capabilities.automationName ?? "").toLowerCase();
        if (!((platform === "ios" && driver === "xcuitest") || (platform === "android" && driver === "uiautomator2")))
            return [];
        const name = capabilities["appium:deviceName"] ?? capabilities.deviceName;
        return [
            {
                id: `appium:${session.id}`,
                name: typeof name === "string" ? name : platform === "ios" ? "iPhone session" : "Android session",
                kind: platform === "ios" ? "ios-device" : "android-device",
                status: "connected",
                runtime: `${platform === "ios" ? "iOS" : "Android"} · Appium ${driver}`,
                capabilities:
                    platform === "ios" ? ["screenshot", "tap", "type"] : ["screenshot", "tap", "type", "back"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            } as ComputerTarget,
        ];
    });
}

class AppiumProtocolError extends Error {
    constructor(public status: number) {
        super(
            status === 403
                ? "Appium session discovery is disabled. Enable session_discovery explicitly on your local Appium server."
                : "Appium operation failed. Check the existing device session and driver."
        );
    }
}

export class ComputerTargetsAppium {
    constructor(
        private configuredUrl: string,
        private request: typeof fetch = fetch
    ) {}

    private async command(path: string, method = "GET", body?: unknown): Promise<any> {
        const base = validateAppiumUrl(this.configuredUrl);
        const response = await this.request(`${base}${path}`, {
            method,
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
            headers: { "Content-Type": "application/json" },
            ...(body != null ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.body) throw new Error("Appium returned an empty response.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > MaxResponseBytes) throw new Error("Appium response exceeds the size limit.");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel();
        }
        let parsed: any;
        try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            throw new Error("Appium returned an invalid response.");
        }
        if (!response.ok || parsed?.value?.error) throw new AppiumProtocolError(response.status);
        return parsed.value;
    }

    async list(): Promise<ComputerTarget[]> {
        try {
            return parseAppiumTargets(await this.command("/appium/sessions"));
        } catch (error) {
            if (!(error instanceof AppiumProtocolError) || error.status !== 404) throw error;
            return parseAppiumTargets(await this.command("/sessions"));
        }
    }

    async perform(
        target: ComputerTarget,
        action: ComputerTargetAction,
        assertOwnership: () => void = () => {}
    ): Promise<ComputerTargetSnapshot> {
        const id = target.id.slice("appium:".length);
        if (!SessionIdPattern.test(id)) throw new Error("Invalid Appium session identifier.");
        const path = `/session/${id}`;
        if (action.action === "screenshot") {
            const value = await this.command(`${path}/screenshot`);
            if (typeof value !== "string" || value.length > MaxResponseBytes || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
                throw new Error("Invalid Appium screenshot.");
            const image = Buffer.from(value, "base64");
            if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
                throw new Error("Appium screenshot is not a PNG.");
            return { target, imageDataUrl: `data:image/png;base64,${value}`, capturedAt: Date.now() };
        }
        if (action.action === "tap") {
            if (
                ![action.x, action.y].every(
                    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
                )
            )
                throw new Error("Tap coordinates must be between 0 and 1.");
            const rect = await this.command(`${path}/window/rect`);
            if (![rect?.width, rect?.height].every((value) => Number.isFinite(value) && value > 0 && value <= 100_000))
                throw new Error("Appium returned an invalid viewport.");
            assertOwnership();
            await this.command(`${path}/actions`, "POST", {
                actions: [
                    {
                        type: "pointer",
                        id: "kronterm-touch",
                        parameters: { pointerType: "touch" },
                        actions: [
                            {
                                type: "pointerMove",
                                duration: 0,
                                origin: "viewport",
                                x: Math.round(action.x * (rect.width - 1)),
                                y: Math.round(action.y * (rect.height - 1)),
                            },
                            { type: "pointerDown", button: 0 },
                            { type: "pause", duration: 80 },
                            { type: "pointerUp", button: 0 },
                        ],
                    },
                ],
            });
        } else if (action.action === "type") {
            if (typeof action.text !== "string" || action.text.length === 0 || action.text.length > 4096)
                throw new Error("Text must contain 1 to 4096 characters.");
            const active = await this.command(`${path}/element/active`);
            const element = active?.["element-6066-11e4-a52e-4f735466cecf"] ?? active?.ELEMENT;
            if (typeof element !== "string" || !SessionIdPattern.test(element))
                throw new Error("Select a text field on the device first.");
            assertOwnership();
            await this.command(`${path}/element/${element}/value`, "POST", { text: action.text });
        } else if (action.action === "back" && target.kind === "android-device") {
            assertOwnership();
            await this.command(`${path}/back`, "POST", {});
        } else {
            throw new Error("Unsupported Appium action.");
        }
        return { target };
    }
}
