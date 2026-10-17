// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitToHermes, subscribeHermesQuickSubmit } from "./hermes-quick-submit";
vi.mock("@/store/global", () => ({ getApi: () => ({}) }));
const disposers: (() => void)[] = [];
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
    vi.useRealTimers();
});

describe("selection delivery into Hermes", () => {
    it("delivers captured pixels to exactly one surface without putting image bytes in the text", () => {
        const panel = vi.fn();
        const hud = vi.fn();
        disposers.push(subscribeHermesQuickSubmit(panel), subscribeHermesQuickSubmit(hud));
        const images = [{ filename: "mobile-selection.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }];
        submitToHermes("Device provenance", "current", images);
        expect(panel).not.toHaveBeenCalled();
        expect(hud).toHaveBeenCalledExactlyOnceWith({ text: "Device provenance", target: "current", images });
        expect(hud.mock.calls[0][0].text).not.toContain("base64");
    });
    it("preserves queued image bytes and destination when the first surface disappears", () => {
        vi.useFakeTimers();
        const images = [{ filename: "capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }];
        submitToHermes("Captured screen", "new", images);
        subscribeHermesQuickSubmit(vi.fn())();
        const next = vi.fn();
        disposers.push(subscribeHermesQuickSubmit(next));
        vi.runAllTimers();
        expect(next).toHaveBeenCalledExactlyOnceWith({ text: "Captured screen", target: "new", images });
    });
    it("delivers one turn when several chat surfaces are mounted", () => {
        const panel = vi.fn();
        const hud = vi.fn();
        disposers.push(subscribeHermesQuickSubmit(panel), subscribeHermesQuickSubmit(hud));
        submitToHermes("Reviewed context", "current");
        expect(panel).not.toHaveBeenCalled();
        expect(hud).toHaveBeenCalledExactlyOnceWith({ text: "Reviewed context", target: "current" });
    });
    it("keeps pending selection when its first subscriber unmounts before delivery", () => {
        vi.useFakeTimers();
        submitToHermes("Pending context", "current");
        const first = vi.fn();
        subscribeHermesQuickSubmit(first)();
        const next = vi.fn();
        disposers.push(subscribeHermesQuickSubmit(next));
        vi.runAllTimers();
        expect(first).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledExactlyOnceWith({ text: "Pending context", target: "current" });
    });
});
