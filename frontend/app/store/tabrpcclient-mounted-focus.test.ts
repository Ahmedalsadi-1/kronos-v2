// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { TabClient } from "./tabrpcclient";

vi.mock("@/layout/index", () => ({ getLayoutModelForStaticTab: () => ({ getNodeByBlockId: () => null }) }));
vi.mock("@/app/workspace/kronterm-hud-controller", () => ({
    kronTermHudController: { getSnapshot: () => ({ active: false }) },
}));

beforeEach(() => document.body.replaceChildren());

it("focuses a mounted browser surface outside the layout tree", async () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    root.appendChild(input);
    document.body.appendChild(root);
    const focus = vi.spyOn(input, "focus");
    const client = { widgetRoot: () => root };
    const result = await (TabClient.prototype as any).focusWidgetForAgent.call(client, "detached-browser");
    expect(result).toBe(root);
    expect(focus).toHaveBeenCalled();
});

it("still rejects a missing unmounted block", async () => {
    const client = { widgetRoot: () => null };
    await expect((TabClient.prototype as any).focusWidgetForAgent.call(client, "missing")).rejects.toThrow(
        "Block not found"
    );
});

it("reports an unavailable snapshot instead of a successful empty page", async () => {
    const client = { widgetRoot: () => null };
    await expect(
        (TabClient.prototype as any).handle_widgetsnapshot.call(client, null, { blockid: "missing" })
    ).rejects.toThrow("block is not mounted");
});

it("preserves browser snapshot failures for the agent", async () => {
    const root = document.createElement("div");
    const webview = document.createElement("webview");
    Object.assign(webview, { executeJavaScript: vi.fn().mockRejectedValue(new Error("guest navigating")) });
    root.append(webview);
    const client = { widgetRoot: () => root, observeWidgetForAgent: () => root };
    await expect(
        (TabClient.prototype as any).handle_widgetsnapshot.call(client, null, { blockid: "browser" })
    ).rejects.toThrow("Browser snapshot failed: guest navigating");
});

it("captures the browser viewport so screenshot and pointer coordinates agree", async () => {
    const root = document.createElement("div");
    const webview = document.createElement("webview");
    Object.assign(webview, { getWebContentsId: () => 42 });
    root.append(webview);
    const captureBrowserPage = vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,demo" });
    const captureScreenshot = vi.fn();
    window["api"] = { captureBrowserPage, captureScreenshot };
    const client = { focusWidgetForAgent: async () => root };
    try {
        await expect((TabClient.prototype as any).captureBlockScreenshot.call(client, "browser")).resolves.toBe(
            "data:image/png;base64,demo"
        );
        expect(captureBrowserPage).toHaveBeenCalledWith({ guestId: 42 });
        expect(captureScreenshot).not.toHaveBeenCalled();
    } finally {
        delete window["api"];
    }
});
