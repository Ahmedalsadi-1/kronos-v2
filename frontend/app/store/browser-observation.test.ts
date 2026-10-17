// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserHtmlScript, browserObservationScript, browserTargetPointScript } from "./browser-observation";

function visible(element: Element, left = 10) {
    const rect = { x: left, y: 10, left, top: 10, right: left + 100, bottom: 40, width: 100, height: 30 };
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    vi.spyOn(element, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
    element.scrollIntoView = vi.fn();
}
const observe = (limit = 50) => window.eval(browserObservationScript(limit));

describe("browser observation and click targeting", () => {
    beforeEach(() => {
        vi.stubGlobal("CSS", { escape: (value: string) => value });
        document.body.innerHTML = "";
        delete window["__kronBrowserObservation"];
    });
    it("gives repeated labels distinct stable refs and resolves their exact controls", () => {
        document.body.innerHTML = '<button aria-label="Save">One</button><button aria-label="Save">Two</button>';
        const buttons = [...document.querySelectorAll("button")];
        buttons.forEach((el) => visible(el));
        const first = observe();
        expect(first).toHaveLength(2);
        expect(first[0].ref).not.toBe(first[1].ref);
        expect(observe().map((el) => el.ref)).toEqual(first.map((el) => el.ref));
        document.elementFromPoint = vi.fn(() => buttons[1]);
        expect(window.eval(browserTargetPointScript(first[1].ref))).toEqual({ x: 60, y: 25 });
    });
    it("counts visible results rather than hidden candidates and computes label semantics", () => {
        document.body.innerHTML =
            "<button hidden>Hidden</button>".repeat(60) +
            '<label for="email">Email address</label><input id="email" type="email"><input type="password" value="secret">';
        document.querySelectorAll("input").forEach((el) => visible(el));
        const rows = observe(2);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ name: "Email address", role: "textbox" });
        expect(rows[1].value).toBe("");
    });
    it("rejects covered, disabled and detached refs instead of clicking another element", () => {
        document.body.innerHTML = "<button>Save</button><div>Overlay</div>";
        const button = document.querySelector("button");
        visible(button);
        const ref = observe()[0].ref;
        document.elementFromPoint = vi.fn(() => document.querySelector("div"));
        expect(window.eval(browserTargetPointScript(ref))).toBeNull();
        button.disabled = true;
        document.elementFromPoint = vi.fn(() => button);
        expect(window.eval(browserTargetPointScript(ref))).toBeNull();
        button.remove();
        expect(window.eval(browserTargetPointScript(ref))).toBeNull();
    });
});

it("extracts verification HTML while masking password values", () => {
    document.body.innerHTML = '<output id="result">Hello Hermes</output><input type="password" value="secret">';
    expect(window.eval(browserHtmlScript("#result", true))).toEqual(["Hello Hermes"]);
    expect(window.eval(browserHtmlScript("input", false))[0]).not.toContain("secret");
});

it("resolves drag targets without scrolling and invalidating the other endpoint", () => {
    document.body.innerHTML = '<button id="drag-target">Drop here</button>';
    const target = document.querySelector("button");
    visible(target);
    document.elementFromPoint = vi.fn(() => target);
    expect(window.eval(browserTargetPointScript("drag-target", false))).toEqual({ x: 60, y: 25 });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
});
