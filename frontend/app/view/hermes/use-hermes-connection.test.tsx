// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HermesConnectionState, useHermesConnection } from "./use-hermes-connection";

function HermesRuntimeChat({
    tabId,
    enabled = true,
    hostMode,
}: {
    tabId: string;
    enabled?: boolean;
    hostMode?: "kronterm";
}) {
    const { ready, error, retry } = useHermesConnection(tabId, enabled, hostMode);
    return ready ? <div>Hermes conversation</div> : <HermesConnectionState error={error} retry={retry} />;
}

const Mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    unsubscribe: vi.fn(),
    configure: vi.fn(),
    listener: null as ((connection: unknown) => void) | null,
}));
vi.mock("@/store/global", () => ({
    getApi: () => ({
        hermesGetConnection: Mocks.connect,
        onHermesConnection: (listener) => {
            Mocks.listener = listener;
            return Mocks.unsubscribe;
        },
    }),
}));
vi.mock("./hermes-desktop-shim", () => ({
    configureHermesDesktopShim: Mocks.configure,
}));

let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
});
afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
});

describe("HUD connection recovery", () => {
    test("starts Hermes with the workspace context and configures its authenticated connection", async () => {
        Mocks.connect.mockResolvedValue({ baseUrl: "http://127.0.0.1:9119", token: "test-token" });
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" />));
        expect(Mocks.connect).toHaveBeenCalledExactlyOnceWith({ tabId: "workspace" });
        expect(Mocks.configure).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:9119", token: "test-token" });
        expect(element.textContent).toContain("Hermes conversation");
    });

    test("offers recovery after a failed Hermes connection", async () => {
        Mocks.connect
            .mockRejectedValueOnce(new Error("Agent unavailable"))
            .mockResolvedValueOnce({ baseUrl: "http://127.0.0.1:9119", token: "test-token" });
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" />));
        expect(element.querySelector('[role="alert"]')?.textContent).toContain("Agent unavailable");
        await act(async () => element.querySelector("button").click());
        expect(Mocks.connect).toHaveBeenCalledTimes(2);
        expect(element.textContent).toContain("Hermes conversation");
        expect(Mocks.unsubscribe).toHaveBeenCalledOnce();
    });

    test("ignores late connections after unmount", async () => {
        let resolve: (connection: unknown) => void;
        Mocks.connect.mockReturnValue(
            new Promise((complete) => {
                resolve = complete;
            })
        );
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" />));
        await act(async () => root.render(null));
        await act(async () => resolve({ baseUrl: "http://127.0.0.1:9119", token: "test-token" }));
        expect(Mocks.configure).not.toHaveBeenCalled();
        expect(Mocks.unsubscribe).toHaveBeenCalledOnce();
    });
    test("a reconnect clears failure and an older rejected request cannot hide it", async () => {
        let reject: (error: Error) => void;
        Mocks.connect.mockReturnValue(
            new Promise((_resolve, fail) => {
                reject = fail;
            })
        );
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" />));
        await act(async () => Mocks.listener({ baseUrl: "http://127.0.0.1:9119", token: "new-token" }));
        await act(async () => reject(new Error("Old connection failed")));
        expect(element.textContent).toContain("Hermes conversation");
        expect(element.querySelector('[role="alert"]')).toBeNull();
    });
    test("keeps a closed surface disconnected and preserves native host context on opening", async () => {
        Mocks.connect.mockResolvedValue({ baseUrl: "http://127.0.0.1:9119", token: "test-token" });
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" enabled={false} hostMode="kronterm" />));
        expect(Mocks.connect).not.toHaveBeenCalled();
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" hostMode="kronterm" />));
        expect(Mocks.connect).toHaveBeenCalledWith({ tabId: "workspace", hostMode: "kronterm" });
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" enabled={false} />));
        expect(Mocks.unsubscribe).toHaveBeenCalledOnce();
    });

    test("a runtime reconnect clears the visible failure without a manual retry", async () => {
        Mocks.connect.mockRejectedValue(new Error("Agent unavailable"));
        await act(async () => root.render(<HermesRuntimeChat tabId="workspace" />));
        expect(element.querySelector('[role="alert"]')).not.toBeNull();
        await act(async () => Mocks.listener({ baseUrl: "http://127.0.0.1:9119", token: "new-token" }));
        expect(element.querySelector('[role="alert"]')).toBeNull();
        expect(element.textContent).toContain("Hermes conversation");
    });
});
