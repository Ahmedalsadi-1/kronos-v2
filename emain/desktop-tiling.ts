import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ExecFile = promisify(execFile);
export type DesktopWindowAction = {
    action: "list" | "launch" | "focus" | "move" | "resize" | "split" | "swap" | "balance" | "float";
    windowId?: number;
    targetWindowId?: number;
    app?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    direction?: "east" | "west" | "north" | "south";
};
type NativeWindow = {
    id: number;
    pid: number;
    app: string;
    title: string;
    frame: { x: number; y: number; w: number; h: number };
    "is-floating": boolean;
};
const Excluded = /^(Kron(?:Term|OS) (?:HUD|Overlay|Pet)|Coucou|Kron(?:term|OS) - T\d+|Developer Tools)/i;

export function desktopWindowArgs(input: DesktopWindowAction): string[] {
    if (!Number.isSafeInteger(input.windowId) || input.windowId <= 0)
        throw new Error("A current native window ID is required.");
    const prefix = ["-m", "window", String(input.windowId)];
    switch (input.action) {
        case "focus":
            return [...prefix, "--focus"];
        case "float":
            return [...prefix, "--toggle", "float"];
        case "balance":
            return ["-m", "space", "--balance"];
        case "split":
            if (!["east", "west", "north", "south"].includes(input.direction))
                throw new Error("A split direction is required.");
            return [...prefix, "--insert", input.direction];
        case "swap":
            if (
                !Number.isSafeInteger(input.targetWindowId) ||
                input.targetWindowId <= 0 ||
                input.targetWindowId === input.windowId
            )
                throw new Error("A different target window ID is required.");
            return [...prefix, "--swap", String(input.targetWindowId)];
        case "move":
            if (![input.x, input.y].every(Number.isFinite)) throw new Error("Finite desktop coordinates are required.");
            return [...prefix, "--move", `abs:${Math.round(input.x)}:${Math.round(input.y)}`];
        case "resize":
            if (![input.width, input.height].every((value) => Number.isFinite(value) && value >= 100 && value <= 20000))
                throw new Error("Window dimensions must be between 100 and 20000 points.");
            return [...prefix, "--resize", `abs:${Math.round(input.width)}:${Math.round(input.height)}`];
        default:
            throw new Error("Unsupported desktop window operation.");
    }
}

export class DesktopTiling {
    constructor(
        private run = async (file: string, args: string[]) =>
            (await ExecFile(file, args, { timeout: 4000, maxBuffer: 2 * 1024 * 1024 })).stdout
    ) {}
    private async yabai(args: string[]) {
        for (const file of ["/opt/homebrew/bin/yabai", "/usr/local/bin/yabai", "yabai"]) {
            try {
                return await this.run(file, args);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
                throw new Error(
                    "Yabai operation failed. Check the service, Accessibility permission, and target window availability."
                );
            }
        }
        throw new Error(
            "Yabai is not installed on PATH. Native tiling is unavailable; other HUD features remain available."
        );
    }
    async perform(input: DesktopWindowAction, excludedPids: number[] = []) {
        const list = async (): Promise<NativeWindow[]> => {
            const rows = JSON.parse(await this.yabai(["-m", "query", "--windows"]));
            if (!Array.isArray(rows)) throw new Error("Invalid window inventory from yabai.");
            return rows.filter(
                (row) =>
                    Number.isSafeInteger(row.id) &&
                    !excludedPids.includes(row.pid) &&
                    !Excluded.test(row.title ?? "") &&
                    !/Coucou|Kron(?:Term|OS) Pet/i.test(row.app ?? "")
            );
        };
        if (input.action === "launch") {
            if (typeof input.app !== "string" || !/^[\w.-]{1,200}$/.test(input.app))
                throw new Error("Provide a native app bundle ID.");
            await list();
            await this.run("/usr/bin/open", ["-b", input.app]);
            return { launched: input.app, windows: await list() };
        }
        const windows = await list();
        if (input.action === "list") return { windows };
        if (!windows.some((row) => row.id === input.windowId))
            throw new Error("Native target window is stale or excluded. Query windows again.");
        if (input.action === "swap" && !windows.some((row) => row.id === input.targetWindowId))
            throw new Error("Swap target is stale or excluded.");
        const args = desktopWindowArgs(input);
        if (input.action === "balance") await this.yabai(["-m", "window", String(input.windowId), "--focus"]);
        await this.yabai(args);
        return { windows: await list() };
    }
}
export const desktopTiling = new DesktopTiling();
