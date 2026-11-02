// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSSpaceOverview, useOSSpaceSnapshot } from "./os-space-overview";
import { makeInitialOSModeState } from "./os-workspace-model";

vi.stubGlobal(
    "ResizeObserver",
    class {
        observe() {}
        disconnect() {}
    }
);

const captureScreenshot = vi.hoisted(() => vi.fn());
vi.mock("@/app/store/global", () => ({ getApi: () => ({ captureScreenshot }) }));

const rpc = vi.hoisted(() => ({ GetTabCommand: vi.fn(), GetMetaCommand: vi.fn() }));
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: rpc }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));

it("shows each workspace's own apps without switching or mounting its widgets", async () => {
    const tab = { oid: "current-tab", blockids: ["browser"], meta: {} } as Tab;
    rpc.GetTabCommand.mockResolvedValue({ oid: "other-tab", blockids: ["terminal"], meta: {} });
    rpc.GetMetaCommand.mockResolvedValue({ "frame:title": "Build terminal", view: "term" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSwitch = vi.fn();
    const onDelete = vi.fn();
    try {
        await act(async () =>
            root.render(
                <OSSpaceOverview
                    workspaces={[
                        { id: "current", name: "Research", tabId: tab.oid },
                        { id: "other", name: "Build", tabId: "other-tab" },
                    ]}
                    currentWorkspaceId="current"
                    state={makeInitialOSModeState(tab, tab.blockids)}
                    blocks={[{ blockId: "browser", title: "Research browser" }]}
                    onSwitch={onSwitch}
                    onDelete={onDelete}
                    onCreate={() => {}}
                />
            )
        );
        expect(container.querySelector('[aria-label="Switch to Research"]').textContent).toContain("Research browser");
        const other = container.querySelector<HTMLButtonElement>('[aria-label="Switch to Build"]');
        expect(other.textContent).toContain("Build terminal");
        expect(other.textContent).not.toContain("Research browser");
        expect(onSwitch).not.toHaveBeenCalled();
        expect(container.querySelector(".os-space-overview-heading").textContent).toBe("Workspaces2 spaces");
        expect(container.querySelector(".os-space-overview-current").textContent).toBe("Current");
        expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous workspaces"]').disabled).toBe(true);
        const deleteButton = container.querySelector<HTMLButtonElement>('[aria-label="Delete Build"]');
        expect(deleteButton.closest(".os-space-overview-card").querySelectorAll("button")).toHaveLength(2);
        act(() => deleteButton.click());
        expect(onDelete).toHaveBeenCalledWith("other");
        expect(onSwitch).not.toHaveBeenCalled();
        act(() => other.click());
        expect(onSwitch).toHaveBeenCalledWith("other");
        expect(rpc.GetTabCommand).toHaveBeenCalledTimes(1);
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

it("captures idle desktops without capturing overview chrome or remounting apps", async () => {
    vi.useFakeTimers();
    captureScreenshot.mockResolvedValue(undefined);
    const tab = { oid: "snapshot-tab", blockids: [], meta: {} } as Tab;
    const state = makeInitialOSModeState(tab, []);
    function SnapshotHost({ overview }: { overview: boolean }) {
        const viewport = useRef<HTMLDivElement>(null);
        useOSSpaceSnapshot(
            "snapshot-space",
            { ...state, scene: overview ? { kind: "overview" } : { kind: "freeform" } },
            viewport
        );
        return <div ref={viewport} />;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () => root.render(<SnapshotHost overview={false} />));
        container.firstElementChild.getBoundingClientRect = () =>
            ({ x: 20, y: 10, width: 800, height: 600 }) as DOMRect;
        await act(async () => vi.advanceTimersByTimeAsync(800));
        expect(captureScreenshot).toHaveBeenCalledWith({ x: 20, y: 66, width: 800, height: 544 }, true);
        await act(async () => root.render(<SnapshotHost overview />));
        await act(async () => vi.advanceTimersByTimeAsync(1600));
        expect(captureScreenshot).toHaveBeenCalledTimes(1);
    } finally {
        act(() => root.unmount());
        vi.useRealTimers();
    }
});
