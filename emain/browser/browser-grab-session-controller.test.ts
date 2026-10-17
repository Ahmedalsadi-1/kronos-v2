import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserGrabSessionController } from "./browser-grab-session-controller";
import { buildGuestOverlayScript } from "./grab-guest-script";

function guest() {
    const events = new EventEmitter();
    const selections: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = [];
    const executeJavaScript = vi.fn((script: string) => {
        if (script !== buildGuestOverlayScript("awaitClick")) return Promise.resolve(null);
        return new Promise((resolve, reject) => selections.push({ resolve, reject }));
    });
    return {
        events,
        selections,
        executeJavaScript,
        contents: Object.assign(events, {
            id: 42,
            executeJavaScript,
            isDestroyed: () => false,
        }) as unknown as Electron.WebContents,
    };
}

const payload = () => ({
    page: { sanitizedUrl: "https://example.com/?token=secret" },
    target: { tagName: "button", selector: "#save" },
});

afterEach(() => vi.useRealTimers());

describe("browser grab sessions", () => {
    it("classifies guest cancellation without mistaking page-authored fields for cancellation", async () => {
        const controller = new BrowserGrabSessionController();
        const mock = guest();
        const cancelled = controller.awaitGrabSelection("tab", "cancelled", mock.contents);
        mock.selections[0].resolve({ __krontermCancelled: true });
        expect(await cancelled).toEqual({ opId: "cancelled", kind: "cancelled", reason: "user" });
        const selected = controller.awaitGrabSelection("tab", "selected", mock.contents);
        mock.selections[1].resolve({ ...payload(), message: "cancelled" });
        expect(await selected).toMatchObject({ kind: "selected", opId: "selected" });
    });

    it("cancels main-frame navigation, ignores iframe navigation and late selections", async () => {
        const controller = new BrowserGrabSessionController();
        const mock = guest();
        const result = controller.awaitGrabSelection("tab", "first", mock.contents);
        mock.events.emit("did-start-navigation", {}, "https://ad.example", false, false);
        expect(controller.hasActiveGrabOp("tab")).toBe(true);
        mock.events.emit("did-start-navigation", {}, "https://next.example", false, true);
        expect(await result).toEqual({ opId: "first", kind: "cancelled", reason: "navigation" });
        mock.selections[0].resolve(payload());
        await Promise.resolve();
        expect(controller.hasActiveGrabOp("tab")).toBe(false);
        expect(mock.events.listenerCount("did-start-navigation")).toBe(0);
    });

    it("prevents a replaced operation from settling or cleaning up the new operation", async () => {
        const controller = new BrowserGrabSessionController();
        const mock = guest();
        const old = controller.awaitGrabSelection("tab", "old", mock.contents);
        const current = controller.awaitGrabSelection("tab", "current", mock.contents);
        expect(await old).toEqual({ opId: "old", kind: "cancelled", reason: "user" });
        mock.selections[0].resolve(payload());
        await Promise.resolve();
        expect(controller.hasActiveGrabOp("tab")).toBe(true);
        mock.selections[1].resolve({ __krontermContextMenu: true, payload: payload() });
        expect(await current).toMatchObject({
            opId: "current",
            kind: "context-selected",
            payload: { page: { sanitizedUrl: "https://example.com/" } },
        });
        expect(mock.executeJavaScript).toHaveBeenCalledTimes(2);
    });

    it("cleans up destruction and timeout operations exactly once", async () => {
        vi.useFakeTimers();
        const controller = new BrowserGrabSessionController();
        const mock = guest();
        const destroyed = controller.awaitGrabSelection("tab", "destroyed", mock.contents);
        mock.events.emit("destroyed");
        expect(await destroyed).toEqual({ opId: "destroyed", kind: "cancelled", reason: "evicted" });
        const timeout = controller.awaitGrabSelection("tab", "timeout", mock.contents);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(await timeout).toEqual({ opId: "timeout", kind: "cancelled", reason: "timeout" });
        expect(controller.hasActiveGrabOp("tab")).toBe(false);
    });
});
