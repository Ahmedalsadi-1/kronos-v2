import { expect, it, vi } from "vitest";
import { sendPointerDrag } from "./pointer-drag";

it("paces a held right-button drag and reports the actual path", async () => {
    const events: Electron.MouseInputEvent[] = [];
    const pause = vi.fn(async (_ms: number) => {});
    const move = vi.fn();
    await sendPointerDrag((event) => events.push(event), { x: 0, y: 0 }, { x: 160, y: 80 }, "right", move, pause);
    const held = events.filter((event) => event.type === "mouseMove" && event.modifiers?.length);
    expect(held.length).toBeGreaterThanOrEqual(12);
    expect(held.every((event) => event.button === "right" && event.modifiers.includes("rightbuttondown"))).toBe(true);
    expect(pause).toHaveBeenCalledWith(48);
    expect(pause).toHaveBeenCalledWith(16);
    expect(events.at(-1)).toMatchObject({ type: "mouseUp", x: 160, y: 80, button: "right" });
    expect(move).toHaveBeenLastCalledWith({ x: 160, y: 80 });
});

it("releases the button when movement fails", async () => {
    const events: Electron.MouseInputEvent[] = [];
    await expect(
        sendPointerDrag(
            (event) => {
                events.push(event);
                if (event.modifiers?.length) throw new Error("guest closed");
            },
            { x: 10, y: 20 },
            { x: 100, y: 200 },
            "left",
            undefined,
            async () => {}
        )
    ).rejects.toThrow("guest closed");
    expect(events.at(-1)).toMatchObject({ type: "mouseUp", button: "left" });
});

it("bounds long drags and follows a curved path to the exact target", async () => {
    const points: Array<{ x: number; y: number }> = [];
    const pause = vi.fn(async (_ms: number) => {});
    await sendPointerDrag(
        () => {},
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
        "left",
        (point) => points.push(point),
        pause
    );
    expect(points.some((point) => point.y > 0)).toBe(true);
    expect(points.at(-1)).toEqual({ x: 1200, y: 0 });
    expect(pause.mock.calls.reduce((total, args) => total + Number(args[0]), 0)).toBeLessThan(450);
});
