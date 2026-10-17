// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    advanceAgentCursor,
    drawAgentCursor,
    injectedAgentCursorScript,
    mountAgentCursor,
} from "./agent-cursor-feedback";

function context() {
    return {
        canvas: { width: 800 },
        createRadialGradient: () => ({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
        scale: vi.fn(),
        getTransform: () => ({ a: 1 }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        measureText: () => ({ width: 90 }),
        roundRect: vi.fn(),
        fillText: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe("combined agent cursor", () => {
    it("draws the soft fog, compressed pointer and compact action label together", () => {
        const ctx = context();
        drawAgentCursor(ctx as any, { x: 100, y: 100 }, 100, "Click Save");
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.scale.mock.calls[0][0]).toBeLessThan(1);
        expect(ctx.closePath).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalledWith("Click Save", expect.any(Number), expect.any(Number));
    });
    it("keeps reduced-motion feedback static", () => {
        const ctx = context();
        drawAgentCursor(ctx as any, { x: 100, y: 100 }, 100, "", true);
        expect(ctx.arc).not.toHaveBeenCalled();
        expect(ctx.scale).toHaveBeenCalledWith(1, 1);
    });
    it("ignores the human pointer while accepting explicit agent updates", () => {
        const ctx = context();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn(() => 1)
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        delete window["__kronCursorInjected"];
        window.eval(injectedAgentCursorScript());
        window["__showKronCursor"](true);
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }));
        document.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
        expect(ctx.translate).not.toHaveBeenCalled();
        window["__updateKronCursor"]({ x: 200, y: 200 }, "Click Save", true);
        expect(ctx.translate).toHaveBeenCalled();
        window["__showKronCursor"](false);
        expect(ctx.clearRect).toHaveBeenCalled();
    });
    it("does not restart the frame loop on duplicate agent updates", () => {
        const ctx = context();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn(() => 1)
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const cursor = mountAgentCursor(document.createElement("div"));
        cursor.update({ x: 0, y: 0 });
        cursor.update({ x: 300, y: 100 });
        cursor.update({ x: 300, y: 100 });
        expect(cancelAnimationFrame).not.toHaveBeenCalled();
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
        cursor.destroy();
    });
    it("preserves speed across a retarget and settles without frame-rate dependence", () => {
        const first = advanceAgentCursor({ x: 0, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 0 }, 0.1);
        expect(first.velocity.x).toBeGreaterThan(0);
        const next = advanceAgentCursor(first.point, { x: 400, y: 100 }, first.velocity, 0.001);
        expect(next.point.x).toBeGreaterThan(first.point.x);
        expect(Math.abs(next.velocity.x - first.velocity.x)).toBeLessThan(30);
        const one = advanceAgentCursor({ x: 0, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 0 }, 0.2);
        const two = advanceAgentCursor(first.point, { x: 300, y: 100 }, first.velocity, 0.1);
        expect(two.point.x).toBeCloseTo(one.point.x, 8);
    });
    it("removes its canvas and cancels motion on disposal", () => {
        const ctx = context();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const host = document.createElement("div");
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn(() => 1)
        );
        const cursor = mountAgentCursor(host);
        cursor.update({ x: 0, y: 0 });
        cursor.update({ x: 100, y: 100 });
        expect(host.querySelector("canvas")).not.toBeNull();
        cursor.destroy();
        expect(host.children).toHaveLength(0);
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
