import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

import { sendLspMessage, startLanguageServer, stopAllLanguageServers, stopLanguageServer } from "./emain-lsp";

function makeServer() {
    const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn() },
        kill: vi.fn(),
    });
    spawn.mockReturnValueOnce(proc);
    return proc;
}

function makeOwner() {
    return Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() });
}

function frame(content: string) {
    return Buffer.from(`Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`);
}

afterEach(() => {
    stopAllLanguageServers();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("language server resource lifecycle", () => {
    it("delivers Unicode messages split across byte boundaries without stalling the next message", () => {
        vi.useFakeTimers();
        const proc = makeServer();
        const owner = makeOwner();
        const sessionId = startLanguageServer(owner as any, "go");
        const first = JSON.stringify({ method: "diagnostics", text: "中文😀" });
        const second = JSON.stringify({ method: "ready" });
        const bytes = Buffer.concat([frame(first), frame(second)]);
        const split = bytes.indexOf(Buffer.from("中")) + 1;
        proc.stdout.emit("data", bytes.subarray(0, split));
        proc.stdout.emit("data", bytes.subarray(split));
        expect(owner.send.mock.calls).toEqual([
            ["lsp-message", { sessionId, content: first }],
            ["lsp-message", { sessionId, content: second }],
        ]);
    });

    it.each(["destroyed", "render-process-gone"])("stops orphaned servers on %s and escalates once", (event) => {
        vi.useFakeTimers();
        const proc = makeServer();
        const owner = makeOwner();
        const sessionId = startLanguageServer(owner as any, "go");
        owner.emit(event);
        stopLanguageServer(sessionId);
        sendLspMessage(sessionId, "{}");
        expect(proc.stdin.write).not.toHaveBeenCalled();
        expect(proc.kill.mock.calls).toEqual([["SIGTERM"]]);
        vi.advanceTimersByTime(3000);
        expect(proc.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
        expect(owner.listenerCount("destroyed")).toBe(0);
        expect(owner.listenerCount("render-process-gone")).toBe(0);
    });

    it("releases owner listeners and the shutdown timer when the process exits", () => {
        vi.useFakeTimers();
        const proc = makeServer();
        const owner = makeOwner();
        const sessionId = startLanguageServer(owner as any, "go");
        stopLanguageServer(sessionId);
        proc.emit("exit", 0, null);
        expect(owner.listenerCount("destroyed")).toBe(0);
        expect(owner.listenerCount("render-process-gone")).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        owner.emit("destroyed");
        expect(proc.kill).toHaveBeenCalledTimes(1);
    });

    it("keeps servers for same-document and subframe navigation, and stops them on reload", () => {
        vi.useFakeTimers();
        const proc = makeServer();
        const owner = makeOwner();
        startLanguageServer(owner as any, "go");
        owner.emit("did-start-navigation", {}, "about:blank#section", true, true);
        owner.emit("did-start-navigation", {}, "about:blank", false, false);
        expect(proc.kill).not.toHaveBeenCalled();
        owner.emit("did-start-navigation", {}, "about:blank", false, true);
        expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
        proc.emit("exit", 0, null);
        expect(owner.listenerCount("did-start-navigation")).toBe(0);
    });
});
