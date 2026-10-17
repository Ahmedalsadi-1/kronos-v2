// @vitest-environment jsdom
import { atom } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdeDiagnostics } from "./ade-diagnostics";

const mocks = vi.hoisted(() => ({ markers: [] as any[], refresh: null as () => void, dispose: vi.fn() }));
vi.mock("monaco-editor", () => ({
    MarkerSeverity: { Error: 8, Warning: 4 },
    editor: {
        getModelMarkers: () => mocks.markers,
        onDidChangeMarkers: (callback: () => void) => {
            mocks.refresh = callback;
            return { dispose: mocks.dispose };
        },
    },
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    mocks.markers = [];
    vi.clearAllMocks();
});
async function mount(editor: any) {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const model = { blockId: "file", metaFilePath: atom("/a.ts"), monacoRef: { current: editor } } as any;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<AdeDiagnostics model={model} />));
    return model;
}
describe("ADE diagnostics", () => {
    it("distinguishes an unavailable editor from a file with no reported diagnostics", async () => {
        const model = await mount(null);
        expect(container.textContent).toContain("Open a file");
        model.monacoRef.current = { getModel: () => ({ uri: "a" }), onDidChangeModel: () => ({ dispose: vi.fn() }) };
        await act(async () => window.dispatchEvent(new CustomEvent("preview-editor-ready", { detail: "file" })));
        expect(container.textContent).toContain("No diagnostics reported");
    });
    it("updates existing markers and navigates within the existing editor", async () => {
        const uri = { toString: () => "file:///a.ts" };
        const editor = {
            getModel: () => ({ uri }),
            onDidChangeModel: () => ({ dispose: vi.fn() }),
            setPosition: vi.fn(),
            revealLineInCenter: vi.fn(),
            focus: vi.fn(),
        };
        await mount(editor);
        mocks.markers = [{ resource: uri, message: "Unknown name", severity: 8, startLineNumber: 3, startColumn: 2 }];
        await act(async () => mocks.refresh());
        expect(container.textContent).toContain("Unknown name");
        await act(async () => container.querySelector("button").click());
        expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 2 });
        expect(editor.focus).toHaveBeenCalledOnce();
        editor.getModel = () => ({ uri: { toString: () => "file:///b.ts" } });
        await act(async () => container.querySelector("button").click());
        expect(editor.setPosition).toHaveBeenCalledOnce();
    });
});
