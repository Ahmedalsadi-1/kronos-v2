import { expect, it, vi } from "vitest";
import { browserAccessibilitySnapshot } from "./browser-accessibility";

it("uses Chromium names and roles with DOM references while hiding password values", async () => {
    const sendCommand = vi.fn(async (method) => {
        if (method === "Accessibility.getFullAXTree")
            return {
                nodes: [
                    {
                        backendDOMNodeId: 1,
                        role: { value: "textbox" },
                        name: { value: "Account password" },
                        value: { value: "secret" },
                    },
                    { ignored: true, backendDOMNodeId: 2, role: { value: "button" } },
                ],
            };
        if (method === "DOM.resolveNode") return { object: { objectId: "control" } };
        if (method === "Runtime.callFunctionOn")
            return {
                result: {
                    value: {
                        ref: "unique",
                        x: 4,
                        y: 5,
                        width: 20,
                        height: 10,
                        password: true,
                        visible: true,
                        focusable: true,
                    },
                },
            };
        return {};
    });
    const debuggerApi = { isAttached: () => true, attach: vi.fn(), detach: vi.fn(), sendCommand };
    debuggerApi.isAttached = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const result = await browserAccessibilitySnapshot({ debugger: debuggerApi, isDestroyed: () => false } as any);
    expect(result).toEqual([
        {
            ref: "unique",
            x: 4,
            y: 5,
            width: 20,
            height: 10,
            visible: true,
            focusable: true,
            role: "textbox",
            name: "Account password",
            value: "",
        },
    ]);
    expect(debuggerApi.detach).toHaveBeenCalledOnce();
});

it("does not detach another debugger session", async () => {
    const detach = vi.fn();
    await expect(browserAccessibilitySnapshot({ debugger: { isAttached: () => true, detach } } as any)).rejects.toThrow(
        "busy"
    );
    expect(detach).not.toHaveBeenCalled();
});

it("releases its debugger when capture fails", async () => {
    const detach = vi.fn();
    const guest = {
        isDestroyed: () => false,
        debugger: {
            isAttached: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
            attach: vi.fn(),
            detach,
            sendCommand: vi.fn().mockRejectedValue(new Error("navigating")),
        },
    };
    await expect(browserAccessibilitySnapshot(guest as any)).rejects.toThrow("navigating");
    expect(detach).toHaveBeenCalledOnce();
});

it("keeps usable controls when one accessibility node becomes stale", async () => {
    const sendCommand = vi.fn(async (method, args) => {
        if (method === "Accessibility.getFullAXTree")
            return {
                nodes: [1, 2].map((id) => ({
                    backendDOMNodeId: id,
                    role: { value: "button" },
                    name: { value: "Save" },
                })),
            };
        if (method === "DOM.resolveNode") {
            if (args.backendNodeId === 1) throw new Error("Could not find node");
            return { object: { objectId: "live" } };
        }
        if (method === "Runtime.callFunctionOn")
            return {
                result: { value: { ref: "live", x: 0, y: 0, width: 20, height: 20, visible: true, focusable: true } },
            };
        return {};
    });
    const debuggerApi = {
        isAttached: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand,
    };
    const result = await browserAccessibilitySnapshot({ debugger: debuggerApi, isDestroyed: () => false } as any);
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe("live");
});

it("leaves a replacement debugger attached if its own session was detached", async () => {
    let detached: () => void;
    const debuggerApi = {
        isAttached: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
        attach: vi.fn(),
        detach: vi.fn(),
        on: vi.fn((name, callback) => {
            detached = callback;
        }),
        removeListener: vi.fn(),
        sendCommand: vi.fn(async () => {
            detached();
            return { nodes: [] };
        }),
    };
    await browserAccessibilitySnapshot({ debugger: debuggerApi, isDestroyed: () => false } as any);
    expect(debuggerApi.detach).not.toHaveBeenCalled();
    expect(debuggerApi.removeListener).toHaveBeenCalled();
});

it("bounds a hung accessibility capture and releases its debugger", async () => {
    vi.useFakeTimers();
    const debuggerApi = {
        isAttached: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(async (method) =>
            method === "Runtime.releaseObjectGroup" ? {} : await new Promise(() => {})
        ),
    };
    try {
        const pending = browserAccessibilitySnapshot({ debugger: debuggerApi, isDestroyed: () => false } as any);
        const rejected = expect(pending).rejects.toThrow("deadline exceeded");
        await vi.advanceTimersByTimeAsync(5000);
        await rejected;
        expect(debuggerApi.detach).toHaveBeenCalled();
    } finally {
        vi.useRealTimers();
    }
});
