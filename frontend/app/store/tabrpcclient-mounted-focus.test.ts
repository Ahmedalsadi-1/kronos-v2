// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { TabClient } from "./tabrpcclient";

const surface = vi.hoisted(() => ({ control: vi.fn(async () => ({ success: true, message: "Applied" })) }));
vi.mock("@/app/tab/workspace-surface-runtime", () => ({
    controlWorkspaceSurface: surface.control,
    getWorkspaceSurfaceModeProvider: () => undefined,
}));
vi.mock("@/app/store/global", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/app/store/global")>();
    const { atom } = await import("jotai");
    return { ...original, atoms: { ...original.atoms, staticTabId: atom("tab") } };
});

vi.mock("@/layout/index", () => ({ getLayoutModelForStaticTab: () => ({ getNodeByBlockId: () => null }) }));
vi.mock("@/app/workspace/kronterm-hud-controller", () => ({
    kronTermHudController: { getSnapshot: () => ({ active: false }) },
}));

beforeEach(() => document.body.replaceChildren());

it.each(["os.view.set", "spatial.showOverview", "os.window.overview"])(
    "routes %s in OS mode and gives a recoverable prerequisite in other presentations",
    async (action) => {
        const client = {
            getWorkspacePresentation: () => "os",
            makeWorkspaceSurfaceSnapshot: () => ({ presentation: "os" }),
        };
        const input = { action, presentation: "file" };
        surface.control.mockClear();
        const result = await TabClient.prototype.handle_workspacesurfacecontrol.call(client, null, input);
        expect(JSON.parse(result).success).toBe(true);
        expect(surface.control).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(input));
        surface.control.mockClear();
        for (const presentation of ["widgets", "tabs", "canvas"]) {
            client.getWorkspacePresentation = () => presentation;
            await expect(TabClient.prototype.handle_workspacesurfacecontrol.call(client, null, input)).rejects.toThrow(
                "requires OS presentation"
            );
        }
        expect(surface.control).not.toHaveBeenCalled();
    }
);

it("does not disguise clipboard transport failure as an empty clipboard", async () => {
    window["api"] = { readClipboard: vi.fn().mockRejectedValue(new Error("Clipboard disconnected")) };
    try {
        await expect(
            TabClient.prototype.handle_widgetclipboardget.call({ focusWidgetForAgent: async () => undefined }, null, {
                blockid: "browser",
            })
        ).rejects.toThrow("Clipboard disconnected");
    } finally {
        delete window["api"];
    }
});

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

it("focuses browser content instead of its address field in a detached widget", async () => {
    const root = document.createElement("div");
    const address = document.createElement("input");
    const webview = document.createElement("webview");
    root.append(address, webview);
    document.body.append(root);
    const addressFocus = vi.spyOn(address, "focus");
    const guestFocus = vi.spyOn(webview, "focus");
    await (TabClient.prototype as any).focusWidgetForAgent.call({ widgetRoot: () => root }, "browser");
    expect(guestFocus).toHaveBeenCalledOnce();
    expect(addressFocus).not.toHaveBeenCalled();
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

it("excludes Pen chat during workspace capture and restores it after a failed capture", async () => {
    const root = document.createElement("div");
    root.className = "os-mode-root";
    const host = document.createElement("iframe");
    host.name = "kronos-pen-editor";
    root.append(host);
    document.body.append(root);
    const editor = host.contentDocument.createElement("iframe");
    editor.id = "pen-editor";
    host.contentDocument.body.append(editor);
    const pen = editor.contentDocument;
    const chat = pen.createElement("div");
    chat.dataset.agentSpotlight = "";
    pen.body.append(chat);
    window["api"] = { captureScreenshot: vi.fn(async () => {
        expect(pen.defaultView.getComputedStyle(chat).visibility).toBe("hidden");
        throw new Error("Capture failed");
    }) };
    try {
        const client = { getWorkspacePresentation: () => "os" };
        await expect(TabClient.prototype.handle_workspacesurfacescreenshot.call(client)).rejects.toThrow("Capture failed");
        expect(pen.defaultView.getComputedStyle(chat).visibility).toBe("visible");
    } finally {
        delete window["api"];
    }
});

it("refuses to report browser typing success when no writable field is focused", async () => {
    const root = document.createElement("div");
    const webview = document.createElement("webview");
    const insertText = vi.fn();
    Object.assign(webview, { executeJavaScript: vi.fn().mockResolvedValue(false), insertText });
    root.append(webview);
    const result = await (TabClient.prototype as any).executeRendererInteraction.call({}, root, "browser", "type", {
        text: "hello",
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain("focused editable");
    expect(insertText).not.toHaveBeenCalled();
});

it("requests browser sign-in before sending an agent any page elements", async () => {
    const root = document.createElement("div");
    const webview = document.createElement("webview");
    const executeJavaScript = vi.fn();
    const page = "https://example.com/login";
    Object.assign(webview, { getWebContentsId: () => 42, getURL: () => page, executeJavaScript });
    root.append(webview);
    const request = vi.fn();
    webview.addEventListener("kronterm:browser-account-request", request);
    const state = { status: "required", origin: "https://example.com" };
    window["api"] = { browserAccount: vi.fn().mockResolvedValue(state) };
    const client = { widgetRoot: () => root, observeWidgetForAgent: () => root };
    try {
        await expect(
            (TabClient.prototype as any).handle_widgetsnapshot.call(client, null, { blockid: "browser" })
        ).rejects.toThrow("finish signing in");
        expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: { page, state } }));
        expect(executeJavaScript).not.toHaveBeenCalled();
    } finally {
        delete window["api"];
    }
});
