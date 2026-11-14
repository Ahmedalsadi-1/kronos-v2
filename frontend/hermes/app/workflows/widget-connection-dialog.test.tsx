// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WidgetConnectionDialog } from "./widget-connection-dialog";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("opens a centered browser connection form and rejects unsafe links without inserting a node", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const connect = vi.fn();
    try {
        await act(async () =>
            root.render(
                <WidgetConnectionDialog
                    widget={{ blockId: "web", label: "Research browser", view: "web" }}
                    pending={false}
                    error=""
                    onClose={() => {}}
                    onConnect={connect}
                />
            )
        );
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog.textContent).toContain("Connect Research browser");
        expect(dialog.className).toContain("left-1/2");
        const textarea = dialog.querySelector("textarea");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        await act(async () => {
            setter.call(textarea, "javascript:alert(1)");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () =>
            dialog.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(connect).not.toHaveBeenCalled();
        expect(dialog.querySelector('[role="alert"]').textContent).toContain("HTTP or HTTPS");
        await act(async () => {
            setter.call(textarea, "https://example.com\nhttps://example.org");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () =>
            dialog.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(connect).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: "browser_open_links",
                urls: "https://example.com\nhttps://example.org",
            })
        );
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
