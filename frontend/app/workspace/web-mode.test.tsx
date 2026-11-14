// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { publishWorkspacePresentation, readWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WebModeSurface, WebModeView } from "./web-mode";

const mocks = vi.hoisted(() => ({
    baseUrl: "",
    setConfig: vi.fn(),
    connect: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:48215", token: "test-token" })),
}));

vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { SetConfigCommand: mocks.setConfig } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/store/global", () => ({
    getApi: () => ({ onHermesConnection: () => () => {}, hermesGetConnection: mocks.connect }),
}));
vi.mock("@/app/view/hermes/hermes-desktop-shim", () => ({
    installHermesDesktopShim: (config?: { baseUrl: string }) => {
        if (config) mocks.baseUrl = config.baseUrl;
    },
    configureHermesDesktopShim: (config: { baseUrl: string }) => {
        mocks.baseUrl = config.baseUrl;
    },
}));
vi.mock("@/app/view/hermes/hermes-app", () => ({
    HermesApp: () => <div data-test-gateway={mocks.baseUrl} />,
}));

describe("Hermes web mode surface", () => {
    it("fills the web-mode surface with the Hermes shell when the runtime is ready", () => {
        const markup = renderToStaticMarkup(
            <WebModeSurface onExit={vi.fn()} runtime={{ status: "ready" }}>
                <div data-hermes-web-shell="" />
            </WebModeSurface>
        );

        expect(markup).toContain('data-hermes-web-shell=""');
        expect(markup).not.toContain("<iframe");
    });

    it("keeps the runtime failure recoverable", () => {
        const markup = renderToStaticMarkup(
            <WebModeSurface onExit={vi.fn()} onRetry={vi.fn()} runtime={{ status: "error", message: "offline" }} />
        );

        expect(markup).toContain("KronOS Agent could not start");
        expect(markup).toContain("offline");
        expect(markup).toContain("Retry");
    });

    it("uses the managed gateway and lets Hermes consume Escape before returning to the previous layout", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.useFakeTimers();
        const element = document.createElement("div");
        const root = createRoot(element);
        const consumeEscape = (event: KeyboardEvent) => event.preventDefault();
        document.body.append(element);
        try {
            window.localStorage.setItem("kronterm:web-return-layout", "canvas");
            publishWorkspacePresentation("web");
            await act(async () => root.render(<WebModeView tabId="tab" workspaceId="workspace" />));
            await act(async () => vi.dynamicImportSettled());
            expect(element.querySelector("[data-test-gateway]")?.getAttribute("data-test-gateway")).toBe(
                "http://127.0.0.1:48215"
            );

            window.addEventListener("keydown", consumeEscape, { once: true });
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
            await vi.runAllTimersAsync();
            expect(readWorkspacePresentation()).toBe("tabs");
            expect(mocks.setConfig).not.toHaveBeenCalled();

            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
            await vi.runAllTimersAsync();
            expect(readWorkspacePresentation()).toBe("os");
            expect(mocks.setConfig).toHaveBeenCalledWith({}, { "app:layoutmode": "os" });
        } finally {
            window.removeEventListener("keydown", consumeEscape);
            await act(async () => root.unmount());
            element.remove();
            publishWorkspacePresentation("os");
            window.localStorage.clear();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });
});
