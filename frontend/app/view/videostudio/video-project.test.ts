import { describe, expect, it } from "vitest";
import { captionsAtTime, exportTrimmedSubtitles, isVideoStudioSource, normalizeVideoProject } from "./video-project";

describe("video project", () => {
    it("recognizes supported absolute local video paths without interpreting URLs or relative paths", () => {
        for (const source of ["/assets/first #take.MOV", "C:\\Assets\\clip.mp4", "\\\\media\\clips\\loop.webm"]) {
            expect(isVideoStudioSource(source)).toBe(true);
            expect(normalizeVideoProject({ source }).source).toBe(source);
        }
        for (const source of [
            "clip.mp4",
            "wsh://host/clip.mp4",
            "https://host/clip.mp4",
            "/assets/clip\0.mp4",
            "/still.png",
        ])
            expect(isVideoStudioSource(source)).toBe(false);
    });
    it("recovers invalid stored data and clamps trim to the source duration", () => {
        expect(normalizeVideoProject(null).source).toBe("");
        expect(
            normalizeVideoProject({
                source: "https://untrusted",
                duration: 10,
                trimStart: -2,
                trimEnd: 100,
                captions: [{ text: "bad" }],
            })
        ).toMatchObject({ source: "", trimStart: 0, trimEnd: 10, captions: [] });
    });
    it("shows captions on their half open source intervals", () => {
        const project = normalizeVideoProject({
            duration: 10,
            captions: [{ id: "one", start: 1, end: 3, text: "Hello" }],
        });
        expect(captionsAtTime(project, 1)).toHaveLength(1);
        expect(captionsAtTime(project, 3)).toHaveLength(0);
    });
    it("clips captions to the trim, shifts exported time and excludes outside captions", () => {
        const project = normalizeVideoProject({
            duration: 20,
            trimStart: 5,
            trimEnd: 10,
            captions: [
                { id: "one", start: 4, end: 7, text: "First" },
                { id: "two", start: 9, end: 12, text: "Last" },
                { id: "three", start: 12, end: 14, text: "Outside" },
            ],
        });
        expect(exportTrimmedSubtitles(project)).toBe(
            "1\n00:00:00,000 --> 00:00:02,000\nFirst\n\n2\n00:00:04,000 --> 00:00:05,000\nLast\n"
        );
    });
});
