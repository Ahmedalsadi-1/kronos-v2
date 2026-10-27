// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useBrowserAgentCursor } from "./use-browser-agent-cursor";

it("can dispose after Electron has detached the guest", async () => {
    const guest = document.createElement("webview");
    const executeJavaScript = vi.fn().mockResolvedValue(undefined);
    Object.assign(guest, { executeJavaScript });
    const ref = createRef<Electron.WebviewTag>();
    ref.current = guest as unknown as Electron.WebviewTag;
    const host = document.createElement("div");
    const root = createRoot(host);
    function Test() {
        useBrowserAgentCursor(ref, null, false, "Agent", 0, true);
        return null;
    }
    await act(async () => root.render(<Test />));
    executeJavaScript.mockImplementation(() => {
        throw new Error("The WebView must be attached to the DOM");
    });
    await expect(act(async () => root.unmount())).resolves.toBeUndefined();
});

it("renders feedback inside the browser, restores it after navigation, and clears it on disposal", async () => {
    const guest = document.createElement("webview");
    const executeJavaScript = vi.fn().mockResolvedValue(undefined);
    Object.assign(guest, { executeJavaScript });
    const ref = createRef<Electron.WebviewTag>();
    ref.current = guest as unknown as Electron.WebviewTag;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Test({ active = true, clicks = 1 }: { active?: boolean; clicks?: number }) {
        useBrowserAgentCursor(ref, { x: 120, y: 80 }, active, "Hermes · Click", clicks, true);
        return null;
    }
    try {
        await act(async () => root.render(<Test />));
        const script = executeJavaScript.mock.calls.at(-1)[0];
        expect(script).toContain("window.__showKronCursor?.(true)");
        expect(script).toContain('window.__updateKronCursor?.({"x":120,"y":80}, "Hermes · Click",');
        expect(script).toContain(", true);");
        expect(script).not.toContain("mousemove");
        executeJavaScript.mockClear();
        await act(async () => guest.dispatchEvent(new Event("dom-ready")));
        expect(executeJavaScript).toHaveBeenCalled();
        await act(async () => root.render(<Test active={false} />));
        expect(executeJavaScript.mock.calls.at(-1)[0]).toContain("window.__showKronCursor?.(false)");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
    expect(executeJavaScript).toHaveBeenLastCalledWith("window.__showKronCursor?.(false)");
});

it("coalesces pending movements and replays navigation-ready feedback after an interrupted call", async () => {
    const guest = document.createElement("webview");
    let rejectFirst: (error: Error) => void;
    const executeJavaScript = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    rejectFirst = reject;
                })
        )
        .mockResolvedValue(undefined);
    Object.assign(guest, { executeJavaScript });
    const ref = createRef<Electron.WebviewTag>();
    ref.current = guest as unknown as Electron.WebviewTag;
    const host = document.createElement("div");
    const root = createRoot(host);
    function Test({ x }: { x: number }) {
        useBrowserAgentCursor(ref, { x, y: 10 }, true, "Hermes", 0, false);
        return null;
    }
    try {
        await act(async () => root.render(<Test x={10} />));
        await act(async () => root.render(<Test x={30} />));
        expect(executeJavaScript).toHaveBeenCalledTimes(1);
        await act(async () => {
            guest.dispatchEvent(new Event("dom-ready"));
            rejectFirst(new Error("document replaced"));
        });
        expect(executeJavaScript.mock.calls.at(-1)[0]).toContain('window.__updateKronCursor?.({"x":30,"y":10}');
    } finally {
        await act(async () => root.unmount());
    }
});
