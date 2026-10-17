import { describe, expect, it } from "vitest";
import { DefaultGameProject, exportGameHtml, normalizeGameProject } from "./game-project";

describe("game project export", () => {
    it("normalizes imported parameters and bounds expensive spawning", () => {
        expect(
            normalizeGameProject({ speed: Infinity, spawnRate: 999, duration: -1, playerColor: "red" })
        ).toMatchObject({ speed: 320, spawnRate: 8, duration: 10, playerColor: "#a78bfa" });
    });
    it("does not permit a title to escape the embedded script or title element", () => {
        const html = exportGameHtml({ ...DefaultGameProject, title: "</script><script>alert(1)</script>" });
        expect(html.match(/<script>/g)).toHaveLength(1);
        expect(html).toContain("&lt;/script&gt;");
        expect(html).toContain("\\u003c/script>");
    });
    it("exports the complete playable runtime without external resources", () => {
        const html = exportGameHtml({ ...DefaultGameProject, mode: "dodge" });
        expect(html).toContain("requestAnimationFrame(frame)");
        expect(html).toContain("Avoid the red orbs.");
        expect(html).not.toMatch(/src=|https?:\/\//);
    });
});

it("runs the exported script and pauses on lost focus", () => {
    const callbacks = new Map<string, (event?: unknown) => void>();
    let frame: (time: number) => void;
    const status = { textContent: "" };
    const restart = { onclick: null as (() => void) | null };
    const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
    const canvas = {
        getContext: () => context,
        addEventListener: (name: string, callback: (event?: unknown) => void) => callbacks.set(name, callback),
    };
    const document = {
        querySelector: (selector: string) =>
            selector === "canvas" ? canvas : selector === "#status" ? status : restart,
        addEventListener: (name: string, callback: (event?: unknown) => void) => callbacks.set(name, callback),
    };
    const window = {
        addEventListener: (name: string, callback: (event?: unknown) => void) => callbacks.set(name, callback),
    };
    const html = exportGameHtml(DefaultGameProject);
    const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
    new Function("document", "window", "requestAnimationFrame", script)(
        document,
        window,
        (callback: (time: number) => void) => {
            frame = callback;
        }
    );
    frame(100);
    frame(116);
    expect(status.textContent).toContain("Score 0");
    callbacks.get("blur")();
    frame(132);
    expect(status.textContent).toContain("Paused");
    restart.onclick();
    frame(148);
    expect(status.textContent).not.toContain("Paused");
});
