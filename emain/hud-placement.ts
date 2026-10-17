import fs from "node:fs";

export type HudWindowBounds = { x: number; y: number; width: number; height: number };

export function recoverHudBounds(saved: unknown, fallback: HudWindowBounds, area: HudWindowBounds): HudWindowBounds {
    const candidate = saved as HudWindowBounds;
    if (!candidate || ![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)) {
        return fallback;
    }
    const width = Math.min(area.width, Math.max(Math.min(320, area.width), candidate.width));
    const height = Math.min(area.height, Math.max(Math.min(160, area.height), candidate.height));
    return {
        x: Math.min(area.x + area.width - width, Math.max(area.x, candidate.x)),
        y: Math.min(area.y + area.height - height, Math.max(area.y, candidate.y)),
        width,
        height,
    };
}

export function readHudPlacement(file: string, key: string): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"))[key];
    } catch {
        return null;
    }
}

export function writeHudPlacement(file: string, key: string, bounds: HudWindowBounds): void {
    let placements: Record<string, HudWindowBounds> = {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) placements = parsed;
    } catch {
        // First launch has no placement file.
    }
    const entries = Object.entries(placements)
        .filter(([entry]) => entry !== key)
        .slice(-119);
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries([...entries, [key, bounds]])), { mode: 0o600 });
    fs.renameSync(temporary, file);
}
