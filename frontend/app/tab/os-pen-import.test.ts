// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { importPenLayers, readPenLayerPatch } from "./os-pen-import";
import { getOSSceneZIndices, selectOSSceneEntity } from "./os-scene-order";
import { makeInitialOSModeState, migrateOSModeState } from "./os-workspace-model";

it("imports nested Pen layers as persistent OS objects and preserves stacking when selected", () => {
    const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement
    ) {
        return DOMRect.fromRect({ x: Number.parseFloat(this.style.left) || 0, width: 16, height: 20 });
    });
    try {
        const { layers, skipped } = importPenLayers(
            JSON.stringify({
                version: "2.22",
                variables: { surface: { type: "color", value: "#123456" } },
                children: [
                    {
                        type: "frame",
                        name: "Screen",
                        layout: "none",
                        fill: "$surface",
                        children: [
                            { type: "text", name: "Title", content: "Edit me", x: 12 },
                            { type: "path", geometry: "M0 0 L10 10", viewBox: [0, 0, 10, 10] },
                            { type: "script", scriptUri: "ignored.js" },
                        ],
                    },
                ],
            })
        );
        const [frame, title, path] = layers;
        expect(skipped).toBe(1);
        expect(frame.pen.fill).toBe("#123456");
        expect(title).toMatchObject({ name: "Title", text: "Edit me", x: 12, pen: { parentId: frame.id } });
        expect(path.pen).toMatchObject({ geometry: "M0 0 L10 10", viewBox: "0 0 10 10" });
        const restored = migrateOSModeState({ objects: layers }).objects;
        expect(restored[1]).toMatchObject(title);
        const state = {
            ...makeInitialOSModeState({ oid: "tab", blockids: [], meta: {} } as Tab, []),
            objects: restored,
        };
        const selected = selectOSSceneEntity(state, frame.id);
        expect(selected.selectedEntityId).toBe(frame.id);
        expect(getOSSceneZIndices(selected)).toEqual(getOSSceneZIndices(state));
        expect(document.body.children).toHaveLength(0);
    } finally {
        box.mockRestore();
    }
});

it("rejects files without a Pen document structure", () => {
    expect(() => importPenLayers('{"version":"2.22"}')).toThrow("Choose a valid .pen document.");
});

it("validates native and agent edits without dropping zero coordinates or empty text", () => {
    expect(readPenLayerPatch('{"type":"text","x":0,"text":"","fill":"#24c"}', true)).toMatchObject({
        type: "text",
        patch: { x: 0, text: "" },
        fill: "#24c",
    });
    expect(() => readPenLayerPatch('{"width":0}', false)).toThrow(/positive dimensions/);
    expect(() => readPenLayerPatch('{"type":"script"}', true)).toThrow(/supported layer/);
});
