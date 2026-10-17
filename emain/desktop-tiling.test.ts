import { describe, expect, it, vi } from "vitest";
import { DesktopTiling, desktopWindowArgs } from "./desktop-tiling";

describe("native tiling", () => {
    it("uses bounded argument operations and rejects invalid targets", () => {
        expect(desktopWindowArgs({ action: "move", windowId: 12, x: -1200, y: 30 })).toEqual(["-m", "window", "12", "--move", "abs:-1200:30"]);
        expect(() => desktopWindowArgs({ action: "swap", windowId: 12, targetWindowId: 12 })).toThrow();
        expect(() => desktopWindowArgs({ action: "resize", windowId: 12, width: NaN, height: 600 })).toThrow();
    });
    it("excludes overlay owners and refreshes before and after mutation", async () => {
        const rows = JSON.stringify([{ id: 1, pid: 100, title: "Browser" }, { id: 2, pid: 101, title: "KronTerm HUD" }, { id: 3, pid: 102, title: "Project" }]);
        const run = vi.fn(async (_file: string, args: string[]) => args.includes("query") ? rows : "");
        const service = new DesktopTiling(run);
        await expect(service.perform({ action: "focus", windowId: 1 }, [100])).rejects.toThrow("stale or excluded");
        await expect(service.perform({ action: "focus", windowId: 2 })).rejects.toThrow("stale or excluded");
        expect((await service.perform({ action: "focus", windowId: 3 })).windows.map((row) => row.id)).toEqual([1, 3]);
        expect(run.mock.calls.at(-1)[1]).toEqual(["-m", "query", "--windows"]);
    });
    it("reports unavailable yabai before launching an application", async () => {
        const run = vi.fn(async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); });
        await expect(new DesktopTiling(run).perform({ action: "launch", app: "com.apple.Safari" })).rejects.toThrow("not installed");
        expect(run.mock.calls.length).toBe(3);
    });
});
