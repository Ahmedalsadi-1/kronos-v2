// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSSpaceOverview } from "./os-space-overview";
import { makeInitialOSModeState } from "./os-workspace-model";

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
                    onCreate={() => {}}
                />
            )
        );
        expect(container.querySelector('[aria-label="Switch to Research"]').textContent).toContain("Research browser");
        const other = container.querySelector<HTMLButtonElement>('[aria-label="Switch to Build"]');
        expect(other.textContent).toContain("Build terminal");
        expect(other.textContent).not.toContain("Research browser");
        expect(onSwitch).not.toHaveBeenCalled();
        act(() => other.click());
        expect(onSwitch).toHaveBeenCalledWith("other");
        expect(rpc.GetTabCommand).toHaveBeenCalledTimes(1);
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});
