// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ComputersApi, ComputersController, ComputersState } from "./computers-state";
import { DeviceWorkspace } from "./device-workspace";

vi.mock("./computers", () => ({ ComputersPanel: () => <div>Live screen</div> }));
const targets: ComputersState["targets"] = [
    {
        id: "android",
        name: "Pixel 8",
        kind: "android-emulator",
        runtime: "Android 14",
        status: "shutdown",
        capabilities: ["boot"],
        controlOwner: "user",
        controlGeneration: 1,
        labs: true,
    },
    {
        id: "ios",
        name: "iPhone",
        kind: "ios-simulator",
        runtime: "iOS 26",
        status: "shutdown",
        capabilities: ["boot"],
        controlOwner: "user",
        controlGeneration: 1,
        labs: true,
    },
];
it("defaults to one iPhone, exposes both platforms in farm, and limits settings to supported actions", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const refresh = vi.fn();
    const api = { listComputerTargets: vi.fn(), performComputerTargetAction: vi.fn() } as unknown as ComputersApi;
    const state: ComputersState = { targets, selectedId: "android", loading: false, busy: false, error: "" };
    await act(async () =>
        root.render(
            <DeviceWorkspace state={state} controller={{ refresh } as unknown as ComputersController} api={api} />
        )
    );
    const visibleTiles = () =>
        Array.from(host.querySelectorAll<HTMLElement>(".kt-device-tile")).filter((tile) => !tile.hidden);
    expect(visibleTiles().map((tile) => tile.getAttribute("aria-label"))).toEqual(["iPhone"]);
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "Farm")
            .click()
    );
    expect(visibleTiles()).toHaveLength(2);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Settings for Pixel 8"]').click());
    const inspector = host.querySelector('[aria-label="Device settings for Pixel 8"]');
    expect(inspector.textContent).toContain("Start device");
    expect(inspector.textContent).not.toContain("Screenshot");
    expect(inspector.textContent).not.toContain("Record");
    const search = host.querySelector<HTMLInputElement>('[aria-label="Search devices"]');
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, "iPhone");
        search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(visibleTiles().map((tile) => tile.getAttribute("aria-label"))).toEqual(["iPhone"]);
    await act(async () => root.unmount());
});

it("releases hidden farm sessions while preserving the selected live session", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const stop = vi.fn(async () => ({ success: true as const, data: undefined }));
    const start = vi.fn(async (targetId: string) => ({
        success: true as const,
        data: { id: `session-${targetId}`, targetId, controlGeneration: 1, live: true as const },
    }));
    const api = {
        startComputerTargetSession: start,
        stopComputerTargetSession: stop,
        readComputerTargetFrame: () => new Promise(() => {}),
    } as unknown as ComputersApi;
    const state: ComputersState = {
        targets: targets.map((target) => ({ ...target, status: "booted" })),
        selectedId: "ios",
        loading: false,
        busy: false,
        error: "",
    };
    await act(async () =>
        root.render(
            <DeviceWorkspace
                state={state}
                controller={{ refresh: vi.fn() } as unknown as ComputersController}
                api={api}
            />
        )
    );
    expect(start.mock.calls.map(([id]) => id)).toEqual(["ios"]);
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "Farm")
            .click()
    );
    expect(start.mock.calls.map(([id]) => id)).toEqual(["ios", "android"]);
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "Single")
            .click()
    );
    expect(stop).toHaveBeenCalledWith("session-android");
    expect(stop).not.toHaveBeenCalledWith("session-ios");
    await act(async () => root.unmount());
    expect(stop).toHaveBeenCalledWith("session-ios");
});

it("lists more than two devices and supports close, restore, minimize and expand", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const many = [...targets, { ...targets[0], id: "third", name: "Third phone" }];
    await act(async () =>
        root.render(
            <DeviceWorkspace
                state={{ targets: many, selectedId: "ios", loading: false, busy: false, error: "" }}
                controller={{ refresh: vi.fn() } as unknown as ComputersController}
                api={{} as ComputersApi}
            />
        )
    );
    const selector = host.querySelector<HTMLSelectElement>('[aria-label="Device list"]');
    expect(selector.options).toHaveLength(3);
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "Farm")
            .click()
    );
    expect(host.querySelectorAll("article:not([hidden])")).toHaveLength(3);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Close Third phone"]').click());
    expect(host.querySelectorAll("article:not([hidden])")).toHaveLength(2);
    await act(async () => {
        selector.value = "third";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelectorAll("article:not([hidden])")).toHaveLength(3);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Minimize Third phone"]').click());
    expect(host.querySelector('[aria-label="Third phone"] .kt-device-live').hasAttribute("hidden")).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Expand Third phone"]').click());
    expect(host.querySelector('[aria-label="Third phone"]').classList.contains("is-expanded")).toBe(true);
    await act(async () => root.unmount());
});

it("routes the close icon to the owning widget when hosted in KronTerm", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const closeWidget = vi.fn();
    await act(async () =>
        root.render(
            <DeviceWorkspace
                state={{ targets, selectedId: "ios", loading: false, busy: false, error: "" }}
                controller={{ refresh: vi.fn() } as unknown as ComputersController}
                api={{} as ComputersApi}
                onCloseWidget={closeWidget}
            />
        )
    );
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Close iPhone"]').click());
    expect(closeWidget).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLElement>('[aria-label="iPhone"]').hidden).toBe(false);
    await act(async () => root.unmount());
});

it("prefers a running Xcode iPhone over an iPad and refreshes the catalog on focus", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const refresh = vi.fn();
    const discovered = [
        { ...targets[1], id: "ipad", name: "iPad Pro" },
        targets[1],
        { ...targets[1], id: "running-iphone", name: "iPhone 17 Pro", status: "booted" as const },
    ];
    await act(async () =>
        root.render(
            <DeviceWorkspace
                state={{ targets: discovered, selectedId: "ipad", loading: false, busy: false, error: "" }}
                controller={{ refresh } as unknown as ComputersController}
                api={{} as ComputersApi}
            />
        )
    );
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Device list"]').value).toBe("running-iphone");
    await act(async () => {
        window.dispatchEvent(new Event("focus"));
    });
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
});

it("lets the user edit the visible farm size and restore all discovered devices", async () => {
    window.localStorage.removeItem("kronterm:device-farm-size");
    const host = document.createElement("div");
    const root = createRoot(host);
    const catalog = [...targets, { ...targets[0], id: "third", name: "Third phone" }];
    await act(async () =>
        root.render(
            <DeviceWorkspace
                state={{ targets: catalog, selectedId: "ios", loading: false, busy: false, error: "" }}
                controller={{ refresh: vi.fn() } as unknown as ComputersController}
                api={{} as ComputersApi}
            />
        )
    );
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "Farm")
            .click()
    );
    const count = host.querySelector<HTMLInputElement>('[aria-label="Farm size"]');
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(count, "1");
        count.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll("article:not([hidden])")).toHaveLength(1);
    expect(window.localStorage.getItem("kronterm:device-farm-size")).toBe("1");
    await act(async () =>
        Array.from(host.querySelectorAll("button"))
            .find((button) => button.textContent === "All")
            .click()
    );
    expect(host.querySelectorAll("article:not([hidden])")).toHaveLength(3);
    await act(async () => root.unmount());
});
