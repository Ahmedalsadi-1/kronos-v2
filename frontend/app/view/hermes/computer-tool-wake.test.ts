import { describe, expect, it, vi } from "vitest";
import { computerActivityTarget, createComputerToolWake } from "./computer-tool-wake";

describe("Computer widget automatic opening", () => {
    it("opens only for live computer work, excluding completion and unrelated tools", () => {
        expect(computerActivityTarget({ phase: "running", name: "orgo_computer_click" })).toEqual({});
        expect(computerActivityTarget({ phase: "succeeded", name: "orgo_computer_click" })).toBeUndefined();
        expect(computerActivityTarget({ phase: "running", name: "read_file" })).toBeUndefined();
        expect(computerActivityTarget({ phase: "running", name: "sandbox_vm_browser" })).toEqual({});
        expect(
            computerActivityTarget({ phase: "running", name: "orgo_computer_click", foreground: false })
        ).toBeUndefined();
        expect(
            computerActivityTarget({ phase: "running", name: "linux_desktop_screenshot", args: { desktopId: "vm-2" } })
        ).toEqual({ desktopId: "vm-2" });
    });
    it("coalesces duplicate and overlapping tool events without reopening for every click", async () => {
        let time = 1000;
        const open = vi.fn(async () => undefined);
        const wake = createComputerToolWake(open, () => time);
        const event = { phase: "running" as const, name: "orgo_computer_click", toolId: "one", sessionId: "bot-1" };
        wake(event);
        wake(event);
        await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
        expect(open).toHaveBeenCalledWith(undefined, "bot-1");
        await new Promise((resolve) => setTimeout(resolve, 0));
        wake({ ...event, toolId: "two" });
        expect(open).toHaveBeenCalledTimes(1);
        time += 31000;
        wake({ ...event, toolId: "three" });
        await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
        time += 31000;
        wake(event);
        expect(open).toHaveBeenCalledTimes(2);
    });
    it("allows later work to retry after a failed launch", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const open = vi.fn().mockRejectedValueOnce(new Error("not ready")).mockResolvedValue(undefined);
        const wake = createComputerToolWake(open);
        wake({ phase: "running", name: "orgo_computer_bash", toolId: "one" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        wake({ phase: "running", name: "orgo_computer_bash", toolId: "two" });
        await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
        vi.restoreAllMocks();
    });
});
