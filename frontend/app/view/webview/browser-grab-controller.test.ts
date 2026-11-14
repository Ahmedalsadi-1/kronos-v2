// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { publishAgentWidgetDesignSelection } from "@/app/view/agent-widget-bridge";
import { beforeEach, expect, it, vi } from "vitest";
import { BrowserGrabController } from "./browser-grab-controller";

const api = vi.hoisted(() => ({
    browserGrab: vi.fn(),
    browserCancelGrab: vi.fn(async () => {}),
    captureBrowserPage: vi.fn(),
    sendHermesSelection: vi.fn(async (_payload: unknown) => {}),
    copyBrowserImage: vi.fn(async () => {}),
}));
vi.mock("@/store/global", () => ({ getApi: () => api }));
vi.mock("@/app/view/agent-widget-bridge", () => ({ publishAgentWidgetDesignSelection: vi.fn() }));
const Payload = {
    page: { title: "Example", sanitizedUrl: "https://example.com", capturedAt: "2026-10-13" },
    target: {
        selector: "#submit",
        tagName: "button",
        textSnippet: "Submit",
        rectViewport: { x: 1, y: 2, width: 30, height: 20 },
        htmlSnippet: "<button>Submit</button>",
        computedStyles: { color: "red" },
    },
    screenshot: null,
} as any;
beforeEach(() => vi.clearAllMocks());
it("stores an inline comment on its own browser block without submitting a prompt", () => {
    const controller = new BrowserGrabController("owned-browser", () => ({ getWebContentsId: () => 42 }) as any);
    controller.acceptGuestSelection(99, "annotate", Payload, "Wrong guest");
    controller.acceptGuestSelection(42, "annotate", Payload, "Review this control");
    expect(publishAgentWidgetDesignSelection).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ blockId: "owned-browser", comment: "Review this control" })
    );
    expect(api.sendHermesSelection).not.toHaveBeenCalled();
});
it("reviews a guest toolbar selection only on its owning browser block", async () => {
    const controller = new BrowserGrabController("owned-browser", () => ({ getWebContentsId: () => 42 }) as any);
    controller.acceptGuestSelection(99, "annotate", Payload);
    expect(globalStore.get(controller.selection)).toBeNull();
    controller.acceptGuestSelection(42, "annotate", Payload);
    expect(globalStore.get(controller.intent)).toBe("annotate");
    expect(api.sendHermesSelection).not.toHaveBeenCalled();
    await controller.sendToHermes("Fix this button");
    expect(api.sendHermesSelection).toHaveBeenCalledWith({
        target: "current",
        text: expect.stringContaining('browser block "owned-browser"'),
    });
});
async function selected() {
    let guestId = 42;
    api.browserGrab.mockImplementation(async ({ opId }) => ({ opId, kind: "selected", payload: Payload }));
    const controller = new BrowserGrabController("browser", () => ({ getWebContentsId: () => guestId }) as any);
    await controller.setIntent("grab");
    return {
        controller,
        switchGuest: () => {
            guestId = 43;
        },
    };
}
it("sends an optional screenshot separately from compact prompt context to the chosen chat", async () => {
    const { controller } = await selected();
    globalStore.set(controller.settings, { includeScreenshot: true, depth: "compact", destination: "new" });
    api.captureBrowserPage.mockResolvedValue({ dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" });
    await controller.sendToHermes("Inspect it");
    expect(api.sendHermesSelection).toHaveBeenCalledTimes(1);
    const payload = api.sendHermesSelection.mock.calls[0][0] as any;
    expect(payload.target).toBe("new");
    expect(payload.images).toEqual([
        { filename: "browser-selection.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" },
    ]);
    expect(payload.text).not.toContain("base64");
    expect(payload.text).not.toContain("computedStyles");
});
it("does not capture pixels when screenshot inclusion is off and includes full context when requested", async () => {
    const { controller } = await selected();
    globalStore.set(controller.settings, { includeScreenshot: false, depth: "full", destination: "current" });
    await controller.sendToHermes("Inspect it");
    expect(api.captureBrowserPage).not.toHaveBeenCalled();
    expect(api.sendHermesSelection).toHaveBeenCalledWith({
        target: "current",
        text: expect.stringContaining("computedStyles"),
    });
});
it.each(["guest", "generation"])("drops late capture after %s changes", async (change) => {
    const { controller, switchGuest } = await selected();
    globalStore.set(controller.settings, { includeScreenshot: true, depth: "compact", destination: "current" });
    let resolve: (value: any) => void;
    api.captureBrowserPage.mockReturnValue(
        new Promise((done) => {
            resolve = done;
        })
    );
    const sending = controller.sendToHermes("Inspect it");
    if (change === "guest") switchGuest();
    else await controller.setIntent(null);
    resolve({ dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" });
    await sending;
    expect(api.sendHermesSelection).not.toHaveBeenCalled();
});
it("keeps selection for retry when capture fails", async () => {
    const { controller } = await selected();
    globalStore.set(controller.settings, { includeScreenshot: true, depth: "compact", destination: "current" });
    api.captureBrowserPage.mockRejectedValue(new Error("Capture failed"));
    await expect(controller.sendToHermes("Inspect it")).rejects.toThrow("Capture failed");
    expect(globalStore.get(controller.selection)).toBe(Payload);
    expect(api.sendHermesSelection).not.toHaveBeenCalled();
});
