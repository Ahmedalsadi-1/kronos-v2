// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { QemuVncBridge } from "./qemu-vnc-bridge";

it("authenticates the viewer URL, forwards VNC over SSH, and tears down the child", async () => {
    const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
    });
    const launch = vi.fn((_command: string, _args: string[], _options: unknown) => child);
    const bridge = new QemuVncBridge(launch as any);
    const url = await bridge.open(["-i", "/private/vm-key", "cua@127.0.0.1"]);
    try {
        const denied = new WebSocket(url.replace(/\/[^/]+$/, "/invalid"));
        await new Promise<void>((resolve) => denied.once("error", () => resolve()));
        expect(launch).not.toHaveBeenCalled();
        const socket = new WebSocket(url);
        await once(socket, "open");
        expect(launch.mock.calls[0][1]).toEqual([
            "-T",
            "-W",
            "127.0.0.1:5900",
            "-i",
            "/private/vm-key",
            "cua@127.0.0.1",
        ]);
        const received = once(socket, "message");
        child.stdout.write(Buffer.from("RFB 003.008\n"));
        expect((await received)[0].toString()).toBe("RFB 003.008\n");
        const input = once(child.stdin, "data");
        socket.send(Buffer.from([5, 1, 0, 20, 0, 40]));
        expect((await input)[0]).toEqual(Buffer.from([5, 1, 0, 20, 0, 40]));
        bridge.close();
        expect(child.kill).toHaveBeenCalled();
        await once(socket, "close");
    } finally {
        bridge.close();
    }
});
