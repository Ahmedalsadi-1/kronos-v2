import { describe, expect, it, vi } from "vitest";
import { sanitizeDesktopGrabPayload } from "./desktop-picker";
vi.mock("electron", () => ({ app: {}, clipboard: {}, nativeImage: {} }));

const target = {
    application: "Editor",
    role: "AXTextField",
    name: "Name",
    value: "token=abcdef password=hunter2",
    bounds: { x: -50, y: 20, width: 200, height: 40 },
};
describe("desktop picker payloads", () => {
    it("redacts credentials and permits secondary display coordinates", () => {
        const result = sanitizeDesktopGrabPayload(target);
        expect(result.value).toBe("token=[redacted] password=[redacted]");
        expect(result.bounds.x).toBe(-50);
    });
    it("omits secure fields and untrusted screenshot data", () => {
        const result = sanitizeDesktopGrabPayload({ ...target, secure: true, screenshot: "injected" });
        expect(result.value).toBe("[redacted]");
        expect(result.name).toBe("[redacted]");
        expect(result.screenshot).toBeUndefined();
    });
    it("rejects malformed and excessive capture bounds", () => {
        expect(() =>
            sanitizeDesktopGrabPayload({ ...target, bounds: { ...target.bounds, width: Infinity } })
        ).toThrow();
        expect(() => sanitizeDesktopGrabPayload({ ...target, bounds: { ...target.bounds, width: 20000 } })).toThrow();
    });
});
