// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceSurfaceOpacity, WorkspaceWallpaper, WorkspaceWallpaperSettings } from "./workspace-wallpaper";

const mocks = vi.hoisted(() => ({
    getPathForFile: vi.fn(),
    getSettingsKeyAtom: vi.fn(),
    setConfig: vi.fn(),
}));

vi.mock("@/store/global", () => ({
    getApi: () => ({ getPathForFile: mocks.getPathForFile }),
    getSettingsKeyAtom: mocks.getSettingsKeyAtom,
}));
vi.mock("@/store/wshclientapi", () => ({ RpcApi: { SetConfigCommand: mocks.setConfig } }));
vi.mock("@/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/util/endpoints", () => ({ getWebServerEndpoint: () => "http://localhost:1619" }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
});

it("saves the native path from the file chooser and loads it through the local media endpoint", async () => {
    const path = "/tmp/Canvas #1.png";
    const wallpaper = atom(path);
    const opacity = atom(44);
    mocks.getSettingsKeyAtom.mockImplementation((key: string) => (key === "window:wallpaper" ? wallpaper : opacity));
    mocks.getPathForFile.mockReturnValue(path);
    mocks.setConfig.mockResolvedValue(undefined);

    await act(async () =>
        root.render(
            <>
                <WorkspaceWallpaperSettings />
                <WorkspaceWallpaper />
            </>
        )
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const click = vi.spyOn(input, "click");
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.textContent.includes("Choose image")).click();
    expect(click).toHaveBeenCalledOnce();

    const image = new File([], "Canvas #1.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [image] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(mocks.getPathForFile).toHaveBeenCalledWith(image);
    expect(mocks.setConfig).toHaveBeenCalledWith(expect.anything(), { "window:wallpaper": path });
    const source = new URL(container.querySelector("img").src);
    expect(source.pathname).toBe("/wave/stream-local-file");
    expect(source.searchParams.get("path")).toBe(path);

    await act(async () => buttons.find((button) => button.textContent.includes("Remove wallpaper")).click());
    expect(mocks.setConfig).toHaveBeenLastCalledWith(expect.anything(), { "window:wallpaper": "" });
});

it("publishes the saved transparency for the live widget surface", async () => {
    const opacity = atom(44);
    mocks.getSettingsKeyAtom.mockReturnValue(opacity);

    function SurfaceAppearance() {
        useWorkspaceSurfaceOpacity();
        return null;
    }

    await act(async () => root.render(<SurfaceAppearance />));
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--kron-live-widget-alpha")).toBe("0.44");
    await act(async () => root.render(null));
    expect(style.getPropertyValue("--kron-live-widget-alpha")).toBe("");
});
