// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { Provider } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InstalledAppsViewModel } from "./installedapps";

vi.mock("@/app/store/global", () => ({
    createBlockSplitHorizontally: () => {
        throw new Error("targetNodeId not found in OS mode");
    },
}));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/app/workspace/kronterm-hud-controller", () => ({
    kronTermHudController: { getSnapshot: () => ({ active: false }) },
}));
vi.mock("@/app/workspace/kronterm-hud-islands", () => ({ launchKronTermHudIsland: vi.fn() }));
vi.mock("@/util/util", () => ({ makeIconClass: () => "" }));

it("opens an app stream through its workspace environment when the OS app has no tiled node", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const createBlock = vi.fn(async () => "stream-id");
    const model = new InstalledAppsViewModel({
        blockId: "os-app",
        waveEnv: {
            createBlock,
            rpc: {
                ListInstalledAppsCommand: async () => [
                    {
                        name: "Calculator",
                        bundleid: "com.apple.calculator",
                        appid: "Calculator",
                        execpath: "/Calculator",
                        category: "Utilities",
                    },
                ],
            },
        },
    } as any);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        const View = model.viewComponent;
        await act(async () =>
            root.render(
                <Provider store={globalStore}>
                    <View model={model} blockId="os-app" blockRef={null} contentRef={null} />
                </Provider>
            )
        );
        const button = [...host.querySelectorAll("button")].find((item) => item.textContent.includes("Calculator"));
        expect(button).toBeTruthy();
        await act(async () => button.click());
        expect(createBlock).toHaveBeenCalledWith({
            meta: { view: "appstream", "appstream:appid": "com.apple.calculator", "appstream:appname": "Calculator" },
        });
        expect(host.textContent).toContain("Streaming Calculator");
    } finally {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    }
});
