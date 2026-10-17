// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HermesRuntimeChat } from "./hermes-runtime-chat";

const Mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    unsubscribe: vi.fn(),
    configure: vi.fn(),
    install: vi.fn(),
}));
vi.mock("@/store/global", () => ({
    getApi: () => ({ hermesGetConnection: Mocks.connect, onHermesConnection: () => Mocks.unsubscribe }),
}));
vi.mock("./hermes-desktop-shim", () => ({
    installHermesDesktopShim: Mocks.install,
    configureHermesDesktopShim: Mocks.configure,
}));
vi.mock("@hermes/lib/kronterm-host", () => ({ markKronTermWidgetHost: vi.fn() }));
vi.mock("./hermes-app", () => ({ HermesApp: () => <div>Hermes conversation</div> }));

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

describe("compatibility AI panel runtime", () => {
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
});
