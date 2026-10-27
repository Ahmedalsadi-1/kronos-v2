// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    advanceAgentCursor,
    drawAgentCursor,
    injectedAgentCursorScript,
    mountAgentCursor,
    sampleAgentParticle,
} from "./agent-cursor-feedback";

function context() {
    return {
        canvas: { width: 800, height: 600 },
        fillStyle: "",
        createRadialGradient: () => ({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
        scale: vi.fn(),
        getTransform: () => ({ a: 1 }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        rect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
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
    it("curves the upward current without repeating each second or jumping between frames", () => {
        const surface = { width: 800, height: 600 };
        const sample = sampleAgentParticle(400, 560, 1725, [], surface);
        const next = sampleAgentParticle(400, 560, 1726, [], surface);
        const repeat = sampleAgentParticle(400, 560, 2725, [], surface);
        expect(Math.abs(sample.y - 560)).toBeGreaterThan(10);
        expect(Math.hypot(next.x - sample.x, next.y - sample.y)).toBeLessThan(1);
        expect(Math.abs(repeat.y - sample.y)).toBeGreaterThan(1);
        const left = sampleAgentParticle(300, 560, 1725, [], surface);
        const right = sampleAgentParticle(500, 560, 1725, [], surface);
        expect(Math.abs(left.y - right.y)).toBeGreaterThan(1);
    });
    it("draws a dense field of white particles while idle", () => {
        const ctx = context();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn(() => 1)
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const host = document.createElement("div");
        Object.defineProperties(host, { clientWidth: { value: 100 }, clientHeight: { value: 100 } });
        const cursor = mountAgentCursor(host, vi.fn());
        cursor.update({ x: 40, y: 40 });
        expect(ctx.rect.mock.calls.length).toBeGreaterThan(1800);
        expect(ctx.fillStyle).toBe("#ffffff");
        expect(requestAnimationFrame).toHaveBeenCalled();
        cursor.destroy();
    });
    it("displaces and brightens particles near a click wave, then settles back", () => {
        const ripple = { point: { x: 80, y: 100 }, at: 0 };
        const baseline = sampleAgentParticle(175, 100, 500, []);
        const disturbed = sampleAgentParticle(175, 100, 500, [ripple]);
        expect(Math.abs(disturbed.x - baseline.x)).toBeGreaterThan(1);
        expect(disturbed.alpha).toBeGreaterThan(baseline.alpha);
        expect(sampleAgentParticle(700, 100, 500, [ripple]).x).toBeCloseTo(sampleAgentParticle(700, 100, 500, []).x, 8);
        expect(sampleAgentParticle(175, 100, 1500, [ripple])).toEqual(sampleAgentParticle(175, 100, 1500, []));
    });
    it("anchors click ripples to the clicked location and clears them on takeover", () => {
        const ctx = context();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        let nextFrame: FrameRequestCallback;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            nextFrame = callback;
            return 1;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const cursor = mountAgentCursor(document.createElement("div"), vi.fn(), (_point, target) => ({
            point: target,
            velocity: { x: 0, y: 0 },
        }));
        cursor.update({ x: 80, y: 100 }, "Click", true);
        const firstRadius = ctx.moveTo.mock.calls[0][0];
        ctx.translate.mockClear();
        cursor.update({ x: 300, y: 250 });
        nextFrame(performance.now() + 100);
        expect(ctx.translate).toHaveBeenCalledWith(80, 100);
        expect(ctx.moveTo.mock.calls.at(-1)[0]).toBeGreaterThan(firstRadius);
        cursor.clear();
        ctx.moveTo.mockClear();
        cursor.update({ x: 300, y: 250 }, "", true, true);
        expect(ctx.moveTo).not.toHaveBeenCalled();
        cursor.destroy();
    });
    it("keeps action labels inside the lower and left edges of the surface", () => {
        const ctx = context();
        drawAgentCursor(ctx as any, { x: 2, y: 595 }, -1, "Click Save");
        const [left, top, width, height] = ctx.roundRect.mock.calls[0] as unknown as number[];
        expect(2 + left).toBeGreaterThanOrEqual(4);
        expect(595 + top + height).toBeLessThanOrEqual(596);
        expect(width).toBeGreaterThan(0);
    });

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
        const aura = host.querySelector<HTMLElement>(".kron-agent-content-aura");
        expect(aura.hidden).toBe(false);
        cursor.update({ x: 100, y: 100 });
        expect(host.querySelector("canvas")).not.toBeNull();
        cursor.clear();
        expect(aura.hidden).toBe(true);
        cursor.update({ x: 100, y: 100 });
        cursor.destroy();
        expect(host.children).toHaveLength(0);
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
