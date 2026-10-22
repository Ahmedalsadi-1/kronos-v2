// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, ipcMain, nativeImage, type WebContents } from "electron";
import type { AppStreamInput } from "../frontend/types/appstream";
import { KronComputerUseClient, type KronComputerUseToolResult } from "../mcp-kron-term/src/kron-computer-use";

function checkedResult(result: KronComputerUseToolResult): KronComputerUseToolResult {
    if (result.isError) {
        throw new Error(
            result.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n") || "App input failed"
        );
    }
    return result;
}

export function validateAppStreamInput(value: AppStreamInput): void {
    if (!value || typeof value.app !== "string" || !value.app.trim() || value.app.length > 256) {
        throw new Error("An exact application target is required");
    }
    if (!["click", "type", "press", "scroll", "drag"].includes(value.action)) throw new Error("Unsupported app input");
    if (["click", "drag"].includes(value.action)) {
        for (const coordinate of [value.x, value.y, ...(value.action === "drag" ? [value.toX, value.toY] : [])]) {
            if (!Number.isFinite(coordinate) || coordinate < 0) throw new Error("Invalid app input coordinates");
        }
        if (![value.frameWidth, value.frameHeight].every((size) => Number.isFinite(size) && size > 0)) {
            throw new Error("The app frame is not ready");
        }
        if (value.button != null && !["left", "right", "middle"].includes(value.button))
            throw new Error("Invalid mouse button");
        if (
            value.clickCount != null &&
            (!Number.isInteger(value.clickCount) || value.clickCount < 1 || value.clickCount > 3)
        )
            throw new Error("Invalid click count");
    }
    if (value.action === "type" && (typeof value.text !== "string" || value.text.length > 1_000_000))
        throw new Error("Invalid app text");
    if (value.action === "press" && (typeof value.keys !== "string" || !value.keys || value.keys.length > 256))
        throw new Error("Invalid key chord");
    if (
        value.action === "scroll" &&
        (!["up", "down", "left", "right"].includes(value.direction) ||
            !Number.isFinite(value.pages) ||
            value.pages <= 0 ||
            value.pages > 8)
    )
        throw new Error("Invalid scroll request");
}

export class AppStreamInputSession {
    private pending: Promise<unknown> = Promise.resolve();
    private closed = false;
    private observed: { app: string; at: number; state: KronComputerUseToolResult; width?: number; height?: number };
    constructor(private client = new KronComputerUseClient()) {}

    close(): void {
        this.closed = true;
        this.client.close();
    }

    send(input: AppStreamInput, isCurrent: () => boolean): Promise<void> {
        validateAppStreamInput(input);
        const request = structuredClone(input);
        const operation = this.pending
            .catch(() => {})
            .then(async () => {
                if (this.closed || !isCurrent()) throw new Error("The app stream owner changed");
                const cached = this.observed;
                const reuse =
                    cached?.app === request.app &&
                    performance.now() - cached.at < 200 &&
                    cached.width === request.frameWidth &&
                    cached.height === request.frameHeight;
                const needsObservation =
                    request.action === "click" || request.action === "drag" || request.action === "scroll";
                const state = needsObservation
                    ? reuse
                        ? cached.state
                        : checkedResult(await this.client.callTool("get_app_state", { app: request.app }))
                    : undefined;
                if (state)
                    this.observed = {
                        app: request.app,
                        at: reuse ? cached.at : performance.now(),
                        state,
                        width: request.frameWidth,
                        height: request.frameHeight,
                    };
                if (this.closed || !isCurrent()) throw new Error("The app stream owner changed");
                const args: Record<string, unknown> = { app: request.app };
                if (request.action === "click" || request.action === "drag") {
                    const image = state.content.find((item) => item.type === "image");
                    if (image?.type !== "image") throw new Error("The app did not provide a coordinate frame");
                    const size = nativeImage.createFromBuffer(Buffer.from(image.data, "base64")).getSize();
                    if (!size.width || !size.height) throw new Error("The app coordinate frame is empty");
                    const point = (x: number, y: number) => ({
                        x: Math.round(Math.min(size.width - 1, (x / request.frameWidth) * size.width)),
                        y: Math.round(Math.min(size.height - 1, (y / request.frameHeight) * size.height)),
                    });
                    const start = point(request.x, request.y);
                    if (request.action === "click")
                        Object.assign(args, start, {
                            mouse_button: request.button ?? "left",
                            click_count: request.clickCount ?? 1,
                        });
                    else {
                        const end = point(request.toX, request.toY);
                        Object.assign(args, { from_x: start.x, from_y: start.y, to_x: end.x, to_y: end.y });
                    }
                }
                if (request.action === "type") args.text = request.text;
                if (request.action === "press") args.key = request.keys;
                if (request.action === "scroll") {
                    const text = state.content
                        .filter((item) => item.type === "text")
                        .map((item) => item.text)
                        .join("\n");
                    const window = text.match(/^\s*(\d+) (?:standard )?window\b/m);
                    if (!window) throw new Error("The app did not provide a scroll target");
                    Object.assign(args, {
                        element_index: window[1],
                        direction: request.direction,
                        pages: request.pages,
                    });
                }
                const tool = { click: "click", type: "type_text", press: "press_key", scroll: "scroll", drag: "drag" }[
                    request.action
                ];
                const result = checkedResult(await this.client.callTool(tool, args));
                if (
                    result.content.some((item) => item.type === "image") &&
                    result.content.some((item) => item.type === "text" && /Window:/.test(item.text))
                ) {
                    this.observed = {
                        app: request.app,
                        at: performance.now(),
                        state: result,
                        width: request.frameWidth,
                        height: request.frameHeight,
                    };
                }
            });
        this.pending = operation.catch((error) => {
            this.observed = undefined;
            throw error;
        });
        void this.pending.catch(() => {});
        return operation;
    }
}

export function registerAppStreamInputIpc(isTrusted: (sender: WebContents) => boolean): void {
    const sessions = new Map<number, AppStreamInputSession>();
    app.on("before-quit", () => {
        for (const session of sessions.values()) session.close();
        sessions.clear();
    });
    ipcMain.handle("appstream-input", async (event, input: AppStreamInput) => {
        const sender = event.sender;
        if (event.senderFrame !== sender.mainFrame || !isTrusted(sender))
            throw new Error("App input requires a trusted workspace");
        validateAppStreamInput(input);
        let session = sessions.get(sender.id);
        if (!session) {
            session = new AppStreamInputSession();
            sessions.set(sender.id, session);
            sender.once("destroyed", () => {
                sessions.get(sender.id)?.close();
                sessions.delete(sender.id);
            });
        }
        const frame = sender.mainFrame;
        const url = frame.url;
        await session.send(
            input,
            () =>
                !sender.isDestroyed() && sender.mainFrame === frame && sender.mainFrame.url === url && isTrusted(sender)
        );
    });
}
