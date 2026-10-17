import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTools } from "./local-tools";

vi.mock("../lib/local-shell", () => ({
    getLocalShellStatus: vi.fn().mockResolvedValue(null),
    runNativeLocalCommand: vi.fn(),
    isKronosCodeCommand: (command: string) => command === "kc",
    cleanTerminalOutput: (output: string) => output.split("\n"),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});
describe("minimal local tools", () => {
    it("persists actual editor changes in app storage", async () => {
        await act(async () => root.render(<LocalTools blocked={false} onBack={vi.fn()} onRemoteShell={vi.fn()} />));
        await act(async () => container.querySelector<HTMLButtonElement>(".local-file-list button")!.click());
        const editor = container.querySelector<HTMLTextAreaElement>("textarea")!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
                editor,
                "export const changed = true;"
            );
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(window.localStorage.getItem("kronterm.local.workspace.v1")).toContain("export const changed = true;");
    });
    it("does not fabricate shell output when the native shell is unavailable", async () => {
        const remote = vi.fn().mockResolvedValue(undefined);
        await act(async () => root.render(<LocalTools blocked={false} onBack={vi.fn()} onRemoteShell={remote} />));
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="iPhone shell"]')!.click());
        expect(container.querySelector<HTMLInputElement>('[aria-label="iPhone shell command"]')!.disabled).toBe(true);
        expect(container.textContent).toContain("Native shell unavailable");
        expect(container.textContent).not.toContain("tests passed");
        await act(async () => container.querySelector<HTMLButtonElement>(".local-remote-shell")!.click());
        expect(remote).toHaveBeenCalledOnce();
    });
});
