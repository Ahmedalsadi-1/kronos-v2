import { expect, it } from "vitest";
import { isPenEditorFrameNavigation } from "./pen-frame-navigation";

const input = {
    url: "http://localhost:9124/pen/editor/index.html?workspace=a",
    name: "kronos-pen-editor",
    parentUrl: "http://localhost:9124/index.html",
    parentName: "",
    topUrl: "http://localhost:9124/index.html",
    parentIsTop: true,
};
it("allows only the staged editor and its direct engine child", () => {
    expect(isPenEditorFrameNavigation(input)).toBe(true);
    const child = {
        ...input,
        url: "http://localhost:9124/pen/web/index.html?embed",
        name: "kronos-pen-engine",
        parentName: "kronos-pen-editor",
        parentUrl: input.url,
        parentIsTop: false,
    };
    expect(isPenEditorFrameNavigation(child)).toBe(true);
    expect(isPenEditorFrameNavigation({ ...child, parentUrl: "http://localhost:9124/another.html" })).toBe(false);
    expect(isPenEditorFrameNavigation({ ...input, url: "https://app.pen.dev" })).toBe(false);
    expect(isPenEditorFrameNavigation({ ...input, url: "http://localhost:9124/pen/editor/other.html" })).toBe(false);
    expect(isPenEditorFrameNavigation({ ...input, name: "unrelated" })).toBe(false);
});
it("resolves the packaged renderer location without granting sibling files", () => {
    const packaged = {
        ...input,
        topUrl: "file:///app/dist/frontend/index.html",
        url: "file:///app/dist/frontend/pen/editor/index.html",
    };
    expect(isPenEditorFrameNavigation(packaged)).toBe(true);
    expect(isPenEditorFrameNavigation({ ...packaged, url: "file:///etc/passwd" })).toBe(false);
});
