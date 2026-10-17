import { describe, expect, it } from "vitest";
import { classifyMedia, filterMedia } from "./media-library-utils";

describe("media inventory", () => {
    it("recognizes native assets and MIME types without claiming all files are media", () => {
        expect(classifyMedia({ path: "/scenes/HOUSE.BLEND" })).toBe("3d");
        expect(classifyMedia({ path: "/unknown", mimetype: "video/mp4" })).toBe("video");
        expect(classifyMedia({ path: "/source.ts" })).toBe("other");
    });
    it("filters source paths while keeping matching folders navigable", () => {
        const items = [
            { path: "/Assets/clip.mp4", name: "clip.mp4" },
            { path: "/Assets/sub", isdir: true },
            { path: "/Assets/photo.png" },
        ];
        expect(filterMedia(items, "ASSETS", "video").map((item) => item.path)).toEqual([
            "/Assets/sub",
            "/Assets/clip.mp4",
        ]);
        expect(filterMedia(items, "photo", "video")).toEqual([]);
    });
});
