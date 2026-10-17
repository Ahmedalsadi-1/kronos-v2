import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PhoneBrowser } from "./phone-browser";

it("keeps per-tab address history, closes tabs, and gates page controls", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    async function visit(url: string) {
        await act(async () => {
            const input = container.querySelector<HTMLInputElement>('input[aria-label="Phone browser address"]')!;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, url);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    }
    try {
        await act(async () => root.render(<PhoneBrowser />));
        await visit("https://example.com/first");
        await visit("https://example.com/second");
        await act(async () => button("Back").click());
        expect(container.querySelector("iframe")!.src).toBe("https://example.com/first");
        await act(async () => button("Forward").click());
        expect(container.querySelector("iframe")!.src).toBe("https://example.com/second");
        await act(async () => button("New phone browser tab").click());
        await visit("https://example.org/");
        await act(async () => button("Show 2 browser tabs").click());
        await act(async () => button("Close example.org").click());
        expect(container.querySelector("iframe")!.src).toBe("https://example.com/second");
        await visit("http://example.com");
        expect(container.querySelector('[role="status"]')!.textContent).toBe("Use an HTTPS web address");
        await act(async () => root.render(<PhoneBrowser controlEnabled={false} />));
        expect(button("Back").disabled).toBe(true);
        expect(container.querySelector("input")!.disabled).toBe(true);
        expect(container.querySelector("iframe")!.style.pointerEvents).toBe("none");
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
}, 20000);
