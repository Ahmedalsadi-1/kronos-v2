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
