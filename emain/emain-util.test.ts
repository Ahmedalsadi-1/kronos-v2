// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { isDevRendererNavigation, shNavHandler } from "./emain-util";
const mocks = vi.hoisted(() => ({ packaged: false, external: vi.fn() }));
vi.mock("electron", () => ({
    app: {
        get isPackaged() {
            return mocks.packaged;
        },
    },
    shell: { openExternal: mocks.external },
}));
vi.mock("./authkey", () => ({ isManagedRuntimeFrame: vi.fn() }));
vi.mock("../frontend/util/endpoints", () => ({ getWebServerEndpoint: () => "http://127.0.0.1:9010" }));
afterEach(() => {
    mocks.packaged = false;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

it("allows reloads only at the configured loopback origin and exact application document", () => {
    const configured = "http://localhost:9124";
    for (const value of [configured + "/index.html", configured + "/index.html?cache=1#workspace"])
        expect(isDevRendererNavigation(value, configured, false)).toBe(true);
    for (const value of [
        "http://localhost:5173/index.html",
        "http://127.0.0.1:9124/index.html",
        configured + "/index.html.evil",
        configured + "/index.html/child",
        configured + "/other.html",
        "http://localhost:9124.evil.example/index.html",
        "http://localhost:9124@example.com/index.html",
        "http://user@localhost:9124/index.html",
        "javascript:alert(1)",
        "not a URL",
    ])
        expect(isDevRendererNavigation(value, configured, false)).toBe(false);
});

it("rejects remote configuration and never enables developer navigation in packaged builds", () => {
    expect(isDevRendererNavigation("https://example.com/index.html", "https://example.com", false)).toBe(false);
    expect(isDevRendererNavigation("http://localhost:9124/index.html", "http://localhost:9124", true)).toBe(false);
    expect(isDevRendererNavigation("http://localhost:5173/index.html", "invalid", false)).toBe(false);
    expect(isDevRendererNavigation("http://localhost:5173/index.html", "", false)).toBe(false);
    expect(isDevRendererNavigation("http://[::1]:9124/index.html", "http://[::1]:9124", false)).toBe(true);
});

it("retains standard development ports only when the renderer URL is absent", () => {
    vi.stubEnv("ELECTRON_RENDERER_URL", undefined);
    for (const host of ["localhost", "127.0.0.1"])
        for (const port of [5173, 5174])
            expect(isDevRendererNavigation(`http://${host}:${port}/index.html`)).toBe(true);
    expect(isDevRendererNavigation("http://localhost:9124/index.html")).toBe(false);
    vi.stubEnv("ELECTRON_RENDERER_URL", "http://localhost:9124");
    expect(isDevRendererNavigation("http://localhost:5173/index.html")).toBe(false);
});

it("keeps a renderer reload inside Electron while preserving external navigation handling", () => {
    vi.stubEnv("ELECTRON_RENDERER_URL", "http://localhost:9124");
    const event = { preventDefault: vi.fn() } as any;
    shNavHandler(event, "http://localhost:9124/index.html?reload=1");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.external).not.toHaveBeenCalled();
    shNavHandler(event, "https://example.com/docs");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.external).toHaveBeenCalledWith("https://example.com/docs");
    mocks.packaged = true;
    shNavHandler(event, "http://localhost:9124/index.html");
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
});
