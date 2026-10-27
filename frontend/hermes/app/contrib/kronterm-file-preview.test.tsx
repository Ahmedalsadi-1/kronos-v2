// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { KrontermFilePreview } from "./kronterm-file-preview";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/app/chat/right-rail/preview-pane", () => ({
    PreviewPane: ({ target }) => <div data-preview-kind={target.previewKind}>{target.path}</div>,
}));
vi.mock("./kronterm-file-editor", () => ({
    KrontermFileEditor: ({ path }) => <textarea aria-label={path} />,
}));
vi.mock("@hermes/lib/desktop-fs", () => ({ isDesktopFsRemoteMode: () => false }));

let cleanup: () => void;
afterEach(() => cleanup?.());

it.each([
    ["/repo/page.html", "html"],
    ["/repo/photo.png", "image"],
    ["/repo/manual.pdf", "pdf"],
])("previews %s rather than loading it as editable text", async (path, kind) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    cleanup = () => act(() => root.unmount());
    await act(async () => root.render(<KrontermFilePreview path={path} onDirtyChange={vi.fn()} />));
    expect(host.querySelector("[data-preview-kind]")?.getAttribute("data-preview-kind")).toBe(kind);
    expect(host.querySelector("textarea")).toBeNull();
});

it("keeps source files in the existing editor", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    cleanup = () => act(() => root.unmount());
    await act(async () => root.render(<KrontermFilePreview path="/repo/app.tsx" onDirtyChange={vi.fn()} />));
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe("/repo/app.tsx");
});
