import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { GuestBrowserActionExpression } from "./guest-browser-actions";

it("scrolls the pointed nested container on both axes and reports boundaries", async () => {
    const dom = new JSDOM('<div id="outer"><div id="inner"><span>content</span></div></div>', {
        runScripts: "outside-only",
        pretendToBeVisual: true,
    });
    const win = dom.window;
    const inner = win.document.querySelector<HTMLElement>("#inner");
    const outer = win.document.querySelector<HTMLElement>("#outer");
    inner.style.overflow = "auto";
    inner.style.overflowX = "auto";
    inner.style.overflowY = "auto";
    Object.defineProperties(inner, {
        scrollWidth: { value: 500 },
        clientWidth: { value: 100 },
        scrollHeight: { value: 700 },
        clientHeight: { value: 100 },
    });
    inner.scrollBy = vi.fn((options: ScrollToOptions) => {
        inner.scrollTop = Math.max(0, Math.min(600, inner.scrollTop + options.top));
        inner.scrollLeft = Math.max(0, Math.min(400, inner.scrollLeft + options.left));
    });
    win.document.elementFromPoint = () => inner.firstElementChild;
    const run = async (args: object) =>
        JSON.parse(await win.eval(GuestBrowserActionExpression.replace("__KRONOS_ACTION__", JSON.stringify(args))));
    try {
        expect(await run({ action: "scroll", deltaX: 120, deltaY: 240 })).toMatchObject({
            actual: { x: 120, y: 240 },
            moved: true,
        });
        expect(outer.scrollTop).toBe(0);
        await run({ action: "scroll", deltaY: 10000 });
        expect(await run({ action: "scroll", deltaY: 10000 })).toMatchObject({ actual: { x: 0, y: 0 }, moved: false });
    } finally {
        win.close();
    }
});

it("rejects ambiguous, hidden, and password targets and dispatches input/change for text fields", async () => {
    const dom = new JSDOM(
        '<input id="field"><input id="password" type="password"><button>one</button><button>two</button>',
        { runScripts: "outside-only" }
    );
    const win = dom.window;
    const field = win.document.querySelector<HTMLInputElement>("#field");
    const password = win.document.querySelector<HTMLInputElement>("#password");
    const run = (args: object) =>
        win.eval(GuestBrowserActionExpression.replace("__KRONOS_ACTION__", JSON.stringify(args)));
    try {
        await expect(run({ action: "click", selector: "button" })).rejects.toThrow("exactly one");
        await expect(run({ action: "fill", selector: "#field", text: "new" })).rejects.toThrow("not visible");
        field.getClientRects = password.getClientRects = () => ({ length: 1 }) as DOMRectList;
        const events: string[] = [];
        field.addEventListener("input", () => events.push("input"));
        field.addEventListener("change", () => events.push("change"));
        await run({ action: "fill", selector: "#field", text: "new" });
        expect(field.value).toBe("new");
        expect(events).toEqual(["input", "change"]);
        await expect(run({ action: "fill", selector: "#password", text: "secret" })).rejects.toThrow("secure login");
    } finally {
        win.close();
    }
});
