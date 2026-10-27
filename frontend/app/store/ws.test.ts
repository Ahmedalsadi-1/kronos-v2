// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { newWebSocket } from "@/util/wsutil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalWS, initGlobalWS, WSControl } from "./ws";

vi.mock("@/util/wsutil", () => ({
    newWebSocket: vi.fn(() => ({ close: vi.fn(), send: vi.fn() })),
}));

describe("workspace connection lifecycle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });
    afterEach(() => {
        globalWS?.shutdown();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    function connected() {
        const controller = new WSControl("ws://localhost", "test", vi.fn());
        controller.connectNow("test");
        return controller;
    }

    it("releases every timer and queued payload on shutdown", () => {
        const controller = connected();
        controller.onopen({} as Event);
        controller.msgQueue.push({ wscommand: "test" });
        controller.runMsgQueue();
        controller.shutdown();
        expect(vi.getTimerCount()).toBe(0);
        expect(controller.open).toBe(false);
        expect(controller.msgQueue).toEqual([]);
    });

    it("can shut down before a socket exists and can shut down repeatedly", () => {
        const controller = new WSControl("ws://localhost", "test", vi.fn());
        expect(() => controller.shutdown()).not.toThrow();
        expect(() => controller.shutdown()).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("cancels pending reconnects", () => {
        const controller = connected();
        controller.onclose({ wasClean: false } as CloseEvent);
        controller.shutdown();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not create duplicate sockets while a connection is opening", () => {
        const controller = connected();
        controller.connectNow("duplicate");
        expect(newWebSocket).toHaveBeenCalledOnce();
        controller.shutdown();
    });

    it("releases the previous global controller when replaced", () => {
        initGlobalWS("ws://localhost", "first", vi.fn());
        globalWS.connectNow("first");
        const previous = globalWS;
        const socket = previous.wsConn;
        initGlobalWS("ws://localhost", "second", vi.fn());
        expect(socket.close).toHaveBeenCalledOnce();
        expect(previous.noReconnect).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
    });

    it("does not retain messages or reopen after shutdown", () => {
        const controller = connected();
        controller.shutdown();
        controller.pushMessage({ wscommand: "rpc", message: { command: "test" } } as WSCommandType);
        controller.onopen({} as Event);
        expect(controller.msgQueue).toEqual([]);
        expect(controller.open).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
});
