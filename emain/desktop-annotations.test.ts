import { afterEach, expect, it, vi } from "vitest";
import { DesktopAnnotations } from "./desktop-annotations";
afterEach(() => vi.useRealTimers());
it("replaces by ID, expires and restores click-through on Done", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const publish = vi.fn(); const model = new DesktopAnnotations(publish);
    model.command({ action: "begin", tool: "pen" });
    expect(model.snapshot().drawing).toBe(true);
    model.command({ action: "add", annotation: { id: "caption", kind: "caption", points: [], text: "Review preview", expiresAt: 1100 } });
    model.command({ action: "add", annotation: { id: "caption", kind: "caption", points: [], text: "Updated", expiresAt: 1100 } });
    expect(model.snapshot().items).toHaveLength(1);
    model.command({ action: "done" }); expect(model.snapshot().drawing).toBe(false);
    vi.advanceTimersByTime(101); expect(model.snapshot().items).toEqual([]);
    model.dispose();
});
it("rejects malformed coordinates and supports undo/removal", () => {
    const model = new DesktopAnnotations();
    expect(() => model.command({ action: "add", annotation: { id: "x", kind: "arrow", points: [{ x: NaN, y: 0 }] } })).toThrow();
    model.command({ action: "add", annotation: { id: "x", kind: "caption", points: [], text: "Hello" } });
    model.command({ action: "undo" }); expect(model.snapshot().items).toEqual([]);
    model.dispose();
});
