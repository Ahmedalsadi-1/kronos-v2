import { expect, it, vi } from "vitest";
import { sendPointerDrag } from "./pointer-drag";

it("paces a held right-button drag and reports the actual path", async () => {
    const events: Electron.MouseInputEvent[] = [];
    const pause = vi.fn(async () => {});
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
