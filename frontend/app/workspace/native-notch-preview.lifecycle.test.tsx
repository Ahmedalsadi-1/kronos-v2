// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { useNativeNotchPreview } from "./use-native-notch-preview";

const mocks = vi.hoisted(() => ({ select: null as any, sync: vi.fn(), off: vi.fn() }));
vi.mock("@/app/store/jotaiStore", () => ({ globalStore: { get: () => "tab" } }));
vi.mock("@/app/store/wos", () => ({}));
vi.mock("@/app/tab/workspace-surface-runtime", () => ({
    getWorkspaceSurfaceModeProvider: () => ({ snapshot: () => ({ selectedblockid: "a" }) }),
}));
vi.mock("@/app/view/agent-widget-bridge", () => ({
    listAgentWidgets: () => ["a", "b"].map((id) => ({ id, view: "appstream" })),
}));
vi.mock("@/store/global", () => ({
    atoms: { staticTabId: "tab" },
    getBlockComponentModel: () => null,
    getApi: () => ({
        syncNativeNotch: mocks.sync,
        onNativeNotchFocus: () => () => {},
        onNativeHudSelectWidget: (callback: any) => {
            mocks.select = callback;
            return mocks.off;
        },
    }),
}));
vi.mock("../../types/agent-activity", () => ({
    subscribeAgentActivityStream: () => () => {},
    isAgentActivityActive: () => true,
}));

function Preview() {
    useNativeNotchPreview(true);
    return null;
}

test("encodes only the selected stream, stops when collapsed, and releases subscriptions", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,frame");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as any);
    const host = document.createElement("div");
    host.innerHTML =
        '<div data-blockid="a"><canvas width="100" height="100"></canvas></div><div data-blockid="b"><canvas width="100" height="100"></canvas></div>';
    document.body.appendChild(host);
    const root = createRoot(document.createElement("div"));
    try {
        await act(async () => root.render(<Preview />));
        expect(encode).toHaveBeenCalledTimes(1);
        expect(mocks.sync.mock.calls.at(-1)[0].previews.map((row: any) => row.image)).toEqual(["frame", undefined]);
        mocks.select({ blockId: "b", expanded: true });
        await act(async () => vi.advanceTimersByTime(1000));
        expect(encode).toHaveBeenCalledTimes(2);
        expect(mocks.sync.mock.calls.at(-1)[0].previews.map((row: any) => row.image)).toEqual([undefined, "frame"]);
        mocks.select({ blockId: "b", expanded: false });
        await act(async () => vi.advanceTimersByTime(3000));
        expect(encode).toHaveBeenCalledTimes(2);
    } finally {
        await act(async () => root.unmount());
        expect(mocks.off).toHaveBeenCalledTimes(1);
        host.remove();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    }
});
