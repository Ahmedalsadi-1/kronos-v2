import { describe, expect, it } from "vitest";
import { canPreviewMedia, canThumbnailMedia, classifyMedia, filterMedia } from "./media-library-utils";

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

    it("opens supported media in the workspace and leaves other formats to native apps", () => {
        expect(canPreviewMedia({ path: "/scenes/HOUSE.GLB" })).toBe(true);
        expect(canPreviewMedia({ path: "/scenes/HOUSE.BLEND" })).toBe(false);
        expect(canPreviewMedia({ path: "/scenes/clip.mp4" })).toBe(true);
        expect(canPreviewMedia({ path: "/scenes/notes.txt", mimetype: "text/plain; charset=utf-8" })).toBe(true);
        expect(canPreviewMedia({ path: "/scenes/report.pdf" })).toBe(true);
        expect(canPreviewMedia({ path: "/scenes/notes.docx" })).toBe(false);
        expect(canPreviewMedia({ path: "/scenes/folder.jpg", isdir: true })).toBe(false);
    });

    it("only requests thumbnails for small raster files", () => {
        expect(canThumbnailMedia({ path: "/assets/panel.PNG", size: 8000 })).toBe(true);
        expect(canThumbnailMedia({ path: "/assets/panel.PNG", size: 50 * 1024 * 1024 })).toBe(false);
        expect(canThumbnailMedia({ path: "/assets/panel.PNG" })).toBe(false);
        expect(canThumbnailMedia({ path: "/assets/panel.PNG", isdir: true, size: 8000 })).toBe(false);
        expect(canThumbnailMedia({ path: "/assets/animation.gif", size: 8000 })).toBe(false);
    });
});
