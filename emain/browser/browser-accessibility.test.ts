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
