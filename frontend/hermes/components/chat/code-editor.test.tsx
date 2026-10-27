// @vitest-environment jsdom
import { acceptCompletion, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CodeEditor } from "./code-editor";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/themes/context", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));
let cleanup: () => Promise<void>;
afterEach(async () => {
    await cleanup?.();
    vi.restoreAllMocks();
});

async function mount(enhanced = true) {
    Object.defineProperties(Range.prototype, {
        getClientRects: { configurable: true, value: () => [] },
        getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
    });
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    await act(async () =>
        root.render(
            <CodeEditor
                enhanced={enhanced}
                filePath="notes.txt"
                initialValue={"greeting greetingAgain\ngree"}
                onChange={onChange}
            />
        )
    );
    cleanup = async () => {
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    };
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor"));
    return { host, view, onChange };
}

it("offers and accepts word completion without replacing the editor buffer", async () => {
    const { host, view, onChange } = await mount();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(startCompletion(view)).toBe(true);
    await vi.waitFor(() => expect(currentCompletions(view.state).map((entry) => entry.label)).toContain("greeting"));
    await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
    expect(view.state.doc.toString()).toBe("greeting greetingAgain\ngreeting");
    expect(onChange).toHaveBeenLastCalledWith("greeting greetingAgain\ngreeting");
    expect(EditorView.findFromDOM(host.querySelector(".cm-editor"))).toBe(view);
});

it("opens an integrated find and replace panel", async () => {
    const { host, view } = await mount();
    expect(openSearchPanel(view)).toBe(true);
    expect(host.querySelector('input[name="search"]')).toBeTruthy();
    expect(host.querySelector('input[name="replace"]')).toBeTruthy();
    expect(host.textContent).toContain("replace all");
});
