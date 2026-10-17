import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { AWAIT_CLICK_SCRIPT } from "./grab-guest-selection-scripts";

describe("guest selection without an intervening hover", () => {
    for (const eventType of ["click", "contextmenu"] as const) {
        it(`hit-tests a stationary ${eventType} against the current page`, async () => {
            const dom = new JSDOM("<button id='target'>Save</button><div id='host'></div>", {
                runScripts: "outside-only",
            });
            const { window } = dom;
            const target = window.document.querySelector("#target");
            const host = window.document.querySelector<HTMLDivElement>("#host");
            const hitTest = vi.fn(() => {
                expect(host.style.pointerEvents).toBe("none");
                return target;
            });
            Object.defineProperty(window.document, "elementFromPoint", { value: hitTest });
            Object.assign(window, {
                __krontermGrab: {
                    host,
                    getCurrentElement: () => null,
                    extractPayload: (element: Element) => ({ selector: element.id }),
                    freezeHighlight: vi.fn(),
                    cleanup: vi.fn(),
                },
            });
            const result = window.eval(AWAIT_CLICK_SCRIPT);
            const event = new window.MouseEvent(eventType, {
                clientX: 80,
                clientY: 60,
                bubbles: true,
                cancelable: true,
            });
            host.dispatchEvent(event);
            expect(await result).toEqual(
                eventType === "click"
                    ? { selector: "target" }
                    : { __krontermContextMenu: true, payload: { selector: "target" } }
            );
            expect(hitTest).toHaveBeenCalledWith(80, 60);
            expect(host.style.pointerEvents).toBe("all");
            expect(event.defaultPrevented).toBe(true);
            dom.window.close();
        });
    }
});
