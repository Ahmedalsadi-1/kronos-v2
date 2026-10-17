// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";

const originalApi = window.petApi;
afterEach(() => {
    window.petApi = originalApi;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
});

test("keeps compact captions distinct, supplies a missing-sprite fallback, and stops JS motion live", async () => {
    document.body.innerHTML = new DOMParser().parseFromString(readFileSync(`${process.cwd()}/pet.html`, "utf8"), "text/html").body.innerHTML;
    localStorage.clear();
    vi.useFakeTimers();
    const startMotion = vi.spyOn(window, "setInterval");
    const stopMotion = vi.spyOn(window, "clearInterval");
    const preference = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal("matchMedia", () => preference);
    const raf = vi.fn(() => 1);
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    let onState: (state: any) => void;
    window.petApi = {
        onState: (callback) => { onState = callback; return () => {}; },
        updateOptions: vi.fn(), sendChat: vi.fn(), resumeContext: vi.fn(), toggleClickThrough: vi.fn(),
        isClickThrough: async () => false, onClickThroughChange: () => () => {},
    };
    await import("./pet");
    const sprite = document.querySelector<HTMLImageElement>("#pet-sprite");
    expect(sprite.src).toContain("kronterm-pet-logo.png");
    for (const [lifecycle, expected] of [
        ["running", "Working in the terminal"], ["awaiting-approval", "Waiting for your approval"],
        ["succeeded", "Task complete"], ["failed", "Task needs attention"],
    ]) {
        onState({ context: "terminal", lifecycle, detail: "KronosCode · Resizing HUD island f258caeb-6493-4c32-b21c-b32267784cb1", active: true, moving: false, action: "type", surface: "terminal" });
        expect(document.querySelector("#detail").textContent).toBe(expected);
        expect(document.querySelector<HTMLElement>("#action").hidden).toBe(true);
    }
    onState({ context: "thinking", lifecycle: "running", detail: "", active: true, moving: false, voiceStatus: "speaking", voiceLevel: 0.4 });
    expect(document.querySelector("#detail").textContent).toBe("speaking");
    expect(document.querySelector<HTMLElement>("#detail").hidden).toBe(false);
    expect(document.querySelector(".voice-speaking")).not.toBeNull();
    onState({ context: "idle", lifecycle: "idle", detail: "", active: false, moving: false, voiceStatus: "listening", voiceLevel: 0.75 });
    expect(document.querySelector(".voice-speaking")).toBeNull();
    expect(document.querySelector<HTMLElement>(".voice-listening").style.getPropertyValue("--voice-level")).toBe("0.75");
    expect(startMotion).not.toHaveBeenCalled();
    preference.matches = false;
    preference.dispatchEvent(new Event("change"));
    expect(startMotion).toHaveBeenCalledTimes(1);
    const motionTimer = startMotion.mock.results[0].value;
    preference.matches = true;
    preference.dispatchEvent(new Event("change"));
    expect(stopMotion).toHaveBeenCalledWith(motionTimer);
    expect(document.querySelector<HTMLElement>(".sprite-shell").style.transform).toBe("");
    expect(cancel).toHaveBeenCalled();
});
