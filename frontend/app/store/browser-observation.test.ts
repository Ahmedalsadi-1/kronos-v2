// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    browserHtmlScript,
    browserObservationScript,
    browserTargetPointScript,
    browserWaitConditionScript,
    mergeBrowserObservations,
} from "./browser-observation";

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

it("observes and targets controls inside open shadow roots", () => {
    document.body.innerHTML = '<div id="component"></div>';
    const host = document.querySelector("#component");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<label id="label">Shadow action</label><button aria-labelledby="label">Run</button>';
    const button = shadow.querySelector("button");
    visible(button);
    const rows = observe();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Shadow action");
    document.elementFromPoint = vi.fn(() => host);
    Object.assign(shadow, { elementFromPoint: vi.fn(() => button) });
    expect(window.eval(browserTargetPointScript(rows[0].ref))).toEqual({ x: 60, y: 25 });
    host.setAttribute("inert", "");
    expect(observe()).toHaveLength(0);
    expect(window.eval(browserTargetPointScript(rows[0].ref))).toBeNull();
});

it("prioritizes on-screen targets and preserves accessibility-generated refs", () => {
    document.body.innerHTML =
        '<button>Offscreen</button><button data-wave-ref="ax-existing">Visible</button><canvas aria-label="Drawing area"></canvas>';
    const [offscreen, onscreen, canvas] = document.body.children;
    visible(offscreen, 10000);
    visible(onscreen);
    visible(canvas);
    expect(observe(1)[0].ref).toBe("ax-existing");
    const rows = observe();
    expect(rows.find((row) => row.name === "Offscreen").visible).toBe(false);
    expect(rows.find((row) => row.name === "Drawing area").role).toBe("canvas");
});

it("waits by snapshot refs and recognizes removed hidden targets", () => {
    document.body.innerHTML = '<button data-wave-ref="snapshot-ref">Ready</button>';
    const button = document.querySelector("button");
    visible(button);
    const check = (condition: string) => window.eval(browserWaitConditionScript("snapshot-ref", condition));
    expect(check("visible")).toBe(true);
    button.style.display = "none";
    expect(check("exists")).toBe(true);
    expect(check("visible")).toBe(false);
    expect(check("hidden")).toBe(true);
    button.remove();
    expect(check("hidden")).toBe(true);
    expect(check("exists")).toBe(false);
});

it("keeps visible DOM targets while enriching their computed accessibility names", () => {
    const geometry = { x: 10, y: 20, width: 30, height: 40, focusable: true, visible: true };
    const result = mergeBrowserObservations(
        [
            { ...geometry, ref: "visible", role: "button", name: "DOM label" },
            { ...geometry, ref: "canvas", role: "canvas", name: "Drawing" },
        ],
        [
            { ...geometry, ref: "visible", role: "button", name: "Computed label", x: 9000, visible: false },
            { ...geometry, ref: "ax-only", role: "slider", name: "Volume" },
        ]
    );
    expect(result.map((el) => el.ref)).toEqual(["visible", "canvas", "ax-only"]);
    expect(result[0]).toMatchObject({ name: "Computed label", x: 10, visible: true });
});
