// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { KronSettingsWorkspaceContent } from "./kronsettings-workspace";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/store/global", async () => {
    const { atom } = await import("jotai");
    return { atoms: { fullConfigAtom: atom({ settings: { "term:copyonselect": true } }) } };
});
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { SetConfigCommand: save } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@hermes/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

it("persists the existing native configuration key and reports save failures", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    save.mockRejectedValueOnce(new Error("Workspace disconnected"));
    try {
        await act(async () => root.render(<KronSettingsWorkspaceContent />));
        const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Copy on select"]');
        await act(async () => toggle.click());
        expect(save).toHaveBeenCalledWith({}, { "term:copyonselect": false });
        expect(host.querySelector('[role="alert"]').textContent).toBe("Workspace disconnected");
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        save.mockResolvedValueOnce(undefined);
        await act(async () => toggle.click());
        expect(host.querySelector('[role="alert"]')).toBeNull();
        expect(host.querySelector('[role="status"]').textContent).toBe("Workspace preferences saved.");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
