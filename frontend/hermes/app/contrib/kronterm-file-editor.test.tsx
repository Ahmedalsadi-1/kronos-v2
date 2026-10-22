// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { KrontermFileEditor } from "./kronterm-file-editor";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/components/chat/code-editor", () => ({
    CodeEditor: ({ initialValue, onChange, onSave, disabled }) => (
        <textarea
            aria-label="Source"
            defaultValue={initialValue}
            disabled={disabled}
            onInput={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.metaKey && event.key === "s") onSave();
            }}
        />
    ),
}));
vi.mock("@hermes/lib/desktop-fs", () => ({ desktopFsProfile: () => "workspace-profile" }));
vi.mock("@hermes/store/review", () => ({ refreshReview: vi.fn() }));
let cleanup: () => Promise<void>;
afterEach(async () => {
    await cleanup?.();
    vi.restoreAllMocks();
});
async function mount(result = { path: "/repo/file.ts", text: "original", binary: false, truncated: false }) {
    const api = vi.fn().mockResolvedValue(result);
    window.hermesDesktop = { api } as any;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dirty = vi.fn();
    await act(async () => root.render(<KrontermFileEditor path="/repo/file.ts" onDirtyChange={dirty} />));
    cleanup = async () => {
        await act(async () => root.unmount());
        host.remove();
    };
    const edit = async (text: string) =>
        act(async () => {
            const input = host.querySelector("textarea");
            input.value = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    const save = async () => act(async () => host.querySelector("button").click());
    return { host, api, dirty, edit, save };
}

it("saves the edited contents using the file's captured profile and keeps the editor mounted", async () => {
    const { host, api, dirty, edit } = await mount();
    const editor = host.querySelector("textarea");
    await edit("updated ✓");
    expect(dirty).toHaveBeenLastCalledWith(true);
    await act(async () =>
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }))
    );
    expect(api).toHaveBeenLastCalledWith({
        path: "/api/fs/write-text",
        method: "POST",
        profile: "workspace-profile",
        body: { path: "/repo/file.ts", content: "updated ✓" },
    });
    expect(host.querySelector("textarea")).toBe(editor);
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(host.textContent).toContain("Saved");
});
it("preserves unsaved edits and refuses to overwrite a file changed on disk", async () => {
    const { host, api, edit, save } = await mount();
    await edit("my changes");
    api.mockResolvedValue({ path: "/repo/file.ts", text: "agent changes" });
    await save();
    expect(api.mock.calls.some(([request]) => request.method === "POST")).toBe(false);
    expect(host.querySelector("textarea").value).toBe("my changes");
    expect(host.querySelector('[role="alert"]').textContent).toContain("changed on disk");
});
it("does not save when the conflict check cannot read the current file", async () => {
    const { host, api, edit, save } = await mount();
    await edit("my changes");
    api.mockRejectedValue(new Error("Connection lost"));
    await save();
    expect(api.mock.calls.some(([request]) => request.method === "POST")).toBe(false);
    expect(host.textContent).toContain("Connection lost");
    expect(host.querySelector("textarea").value).toBe("my changes");
});
it.each(["binary", "truncated"])("blocks editing %s file contents", async (kind) => {
    const { host } = await mount({
        path: "/repo/file.ts",
        text: "partial",
        binary: kind === "binary",
        truncated: kind === "truncated",
    });
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
    expect(host.querySelector("button").disabled).toBe(true);
});
