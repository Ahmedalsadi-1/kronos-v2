// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkflowAccount } from "./account";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("uses the shared account connector without creating a separate sign-in flow", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const connected = vi.fn();
    const connect = vi.fn(async () => undefined);
    try {
        await act(async () => root.render(<WorkflowAccount connect={connect} onConnected={connected} />));
        const values = {
            firstName: "Fixture",
            lastName: "User",
            email: "fixture@example.test",
            password: "Fixture123",
        };
        for (const [name, value] of Object.entries(values))
            host.querySelector<HTMLInputElement>(`[name="${name}"]`).value = value;
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Show password"]').click());
        expect(host.querySelector<HTMLInputElement>('[name="password"]').type).toBe("text");
        await act(async () =>
            host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(connect).toHaveBeenCalledWith(values);
        expect(connected).toHaveBeenCalledOnce();
        expect(host.textContent).not.toMatch(/n8n|sign in/i);
        expect(host.querySelector('input[name="password"]').getAttribute("aria-describedby")).toBeTruthy();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("preserves account fields and reports a failed connection for retry", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const connected = vi.fn();
    try {
        await act(async () =>
            root.render(
                <WorkflowAccount
                    connect={async () => {
                        throw new Error("Account server unavailable");
                    }}
                    onConnected={connected}
                />
            )
        );
        host.querySelector<HTMLInputElement>('[name="email"]').value = "fixture@example.test";
        await act(async () =>
            host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(host.querySelector('[role="alert"]').textContent).toBe("Account server unavailable");
        expect(host.querySelector<HTMLInputElement>('[name="email"]').value).toBe("fixture@example.test");
        expect(connected).not.toHaveBeenCalled();
        expect(host.querySelector<HTMLButtonElement>('[type="submit"]').disabled).toBe(false);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
