import { strFromU8, unzipSync } from "fflate";
import { expect, it } from "vitest";
import { penDownload } from "./os-pen-export";

it("downloads an editable Pen document when no linked assets exist", () => {
    const result = penDownload({ content: '{"version":"2.22","children":[]}' });
    expect(result.name).toBe("design.pen");
    expect(JSON.parse(strFromU8(result.bytes)).children).toEqual([]);
});
it("keeps image bytes alongside the Pen document in a portable archive", () => {
    const content = '{"fill":{"url":"./images/photo.png"}}';
    const result = penDownload({ content, assets: [{ path: "images/photo.png", data: new Uint8Array([1, 2, 3]) }] });
    expect(result.name).toBe("design.zip");
    const files = unzipSync(result.bytes);
    expect(strFromU8(files["design.pen"])).toBe(content);
    expect([...files["images/photo.png"]]).toEqual([1, 2, 3]);
});
it("rejects traversal and document replacement paths in export assets", () => {
    for (const path of ["../escape", "/absolute", "design.pen", "images/../../escape", "C:\\data"]) {
        expect(() => penDownload({ content: "{}", assets: [{ path, data: new Uint8Array() }] })).toThrow("export path");
    }
});
