import { describe, expect, it } from "vitest";
import { hudLocationForMeta } from "./hud-surface-location";

describe("HUD surface locations", () => {
    it("returns only the address or path appropriate to the surface", () => {
        expect(hudLocationForMeta({ view: "web", url: "https://example.com", token: "private" }, "browser")).toBe(
            "https://example.com"
        );
        expect(hudLocationForMeta({ view: "term", "cmd:cwd": "/work" }, "terminal")).toBe("/work");
        expect(hudLocationForMeta({ view: "aifilediff", file: "/work/app.ts" }, "diff")).toBe("/work/app.ts");
        expect(hudLocationForMeta({ view: "sandbox" }, "abcdef1234")).toBe("Sandbox abcdef12");
        expect(hudLocationForMeta({ view: "sysinfo", token: "private" }, "widget")).toBe("");
    });
});
