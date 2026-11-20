// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IntegrationsSettings } from "./integrations-settings";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("opens registered settings and leaves unavailable desktop destinations out", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const open = vi.fn();
    try {
        await act(async () =>
            root.render(
                <IntegrationsSettings
                    destinations={[
                        { id: "kronrender", label: "KronRender", icon: () => null, active: false, onSelect: open },
                    ]}
                />
            )
        );
        expect(host.textContent).toContain("KronRender");
        expect(host.textContent).not.toContain("KronCanvas");
        await act(async () => host.querySelector<HTMLButtonElement>("button").click());
        expect(open).toHaveBeenCalledOnce();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
