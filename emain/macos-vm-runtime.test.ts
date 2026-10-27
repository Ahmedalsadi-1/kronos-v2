// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter, once } from "node:events";
import { createServer } from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { MacVmRuntime, parseMacVmVncUrl } from "./macos-vm-runtime";

const launch = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: launch, execFile: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("rejects remote and unauthenticated VM display addresses", () => {
    expect(parseMacVmVncUrl("still booting")).toBeUndefined();
    expect(parseMacVmVncUrl("VNC server is running at vnc://:secret@127.0.0.1:5900\n")?.port).toBe("5900");
    expect(() => parseMacVmVncUrl("vnc://:secret@example.com:5900")).toThrow("loopback");
    expect(() => parseMacVmVncUrl("vnc://127.0.0.1:5900")).toThrow("authenticated");
});

it("reports unavailable hosts and missing Tart without claiming a VM is ready", async () => {
    expect((await new MacVmRuntime("linux", "arm64").list()).available).toBe(false);
    const runtime = new MacVmRuntime("darwin", "arm64", async () => {
        throw new Error("ENOENT");
    });
    expect(await runtime.list()).toMatchObject({ available: false, machines: [] });
    await expect(runtime.start("--help", 1, "http://localhost")).rejects.toThrow("simple name");
});

it("lists macOS guests and excludes Linux guests", async () => {
    const runtime = new MacVmRuntime(
        "darwin",
        "arm64",
        async () =>
            JSON.stringify([
                { Name: "mac", Running: false },
                { Name: "linux", Running: true },
                { Name: "../bad", Running: false },
            ]),
        async (name) => ({ os: name === "mac" ? "darwin" : "linux" })
    );
    expect((await runtime.list()).machines).toEqual([{ name: "mac", running: false }]);
});

it("runs headlessly, bridges the display, scopes ownership, and tears down its process", async () => {
    const tcp = createServer((socket) => socket.on("data", (data) => socket.write(data)));
    await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
    const port = (tcp.address() as import("node:net").AddressInfo).port;
    const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        exitCode: null,
        signalCode: null,
        kill: vi.fn(function () {
            this.signalCode = "SIGTERM";
            this.emit("exit", null, "SIGTERM");
            return true;
        }),
    });
    launch.mockImplementation(() => {
        queueMicrotask(() => {
            child.stdout.write("VNC server is running at vnc://:sec");
            child.stdout.write(`ret@127.0.0.1:${port}\n`);
        });
        return child;
    });
    const runtime = new MacVmRuntime(
        "darwin",
        "arm64",
        async () => JSON.stringify([{ Name: "mac", Running: false }]),
        async () => ({ os: "darwin" })
    );
    let socket: WebSocket;
    try {
        const connection = await runtime.start("mac", 7, "http://localhost:9124");
        expect(launch.mock.calls[0][1]).toEqual([
            "run",
            "mac",
            "--no-graphics",
            "--vnc-experimental",
            "--no-clipboard",
            "--no-audio",
        ]);
        expect(connection.password).toBe("secret");
        await expect(runtime.stop(connection.sessionId, 8)).rejects.toThrow("another workspace");
        socket = new WebSocket(connection.url, { origin: "http://localhost:9124" });
        await once(socket, "open");
        const response = once(socket, "message");
        socket.send(Buffer.from("RFB"));
        expect(String((await response)[0])).toBe("RFB");
        await runtime.closeOwner(7);
        expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
        socket?.terminate();
        await runtime.dispose();
        await new Promise<void>((resolve) => tcp.close(() => resolve()));
    }
});
