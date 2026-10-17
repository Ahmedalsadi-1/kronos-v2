// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRpcCommand, setDefaultRouter } from "./wshrpcutil-base";

vi.mock("@/app/store/wps", () => ({}));
vi.mock("@/app/store/wshclient", () => ({ WshClient: class {} }));
vi.mock("@/app/store/wshrouter", () => ({ WshRouter: class {} }));
vi.mock("@/util/endpoints", () => ({}));
vi.mock("./ws", () => ({}));

afterEach(() => vi.useRealTimers());
describe("RPC request cancellation", () => {
    it("cancels timed-out backend work and cleans up pending state", async () => {
        vi.useFakeTimers();
        const recvRpcMessage = vi.fn();
        setDefaultRouter({ recvRpcMessage } as any);
        const pending = new Map();
        const generator = sendRpcCommand(pending, { reqid: "read", command: "snapshot", timeout: 100 });
        const response = generator.next();
        const failure = expect(response).rejects.toThrow("EC-TIME");
        await vi.advanceTimersByTimeAsync(100);
        await failure;
        expect(recvRpcMessage).toHaveBeenLastCalledWith({ reqid: "read", cancel: true });
        expect(pending.size).toBe(0);
    });

    it("propagates caller cancellation once and removes its listener", async () => {
        const recvRpcMessage = vi.fn();
        setDefaultRouter({ recvRpcMessage } as any);
        const pending = new Map();
        const controller = new AbortController();
        const generator = sendRpcCommand(pending, { reqid: "write", command: "input" }, controller.signal);
        const response = generator.next();
        const failure = expect(response).rejects.toThrow("EC-CANCEL");
        controller.abort();
        await failure;
        expect(recvRpcMessage).toHaveBeenLastCalledWith({ reqid: "write", cancel: true });
        expect(recvRpcMessage).toHaveBeenCalledTimes(2);
        expect(pending.size).toBe(0);
    });

    it("never dispatches an already cancelled command", () => {
        const recvRpcMessage = vi.fn();
        setDefaultRouter({ recvRpcMessage } as any);
        const controller = new AbortController();
        controller.abort();
        expect(() => sendRpcCommand(new Map(), { reqid: "write", command: "input" }, controller.signal)).toThrow(
            "before dispatch"
        );
        expect(recvRpcMessage).not.toHaveBeenCalled();
    });
});
