// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SandboxLoginCard } from "./sandbox-login-card";

vi.mock("@hermes/app/chat/session-view", async () => {
    const { atom } = await import("nanostores");
    const view = { $runtimeId: atom("chat"), $storedId: atom("stored-chat") };
    return { useSessionView: () => view };
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps private credentials out of the composer and offers Ask first and an explicit return action", async () => {
    const request = {
        id: "request",
        origin: "https://example.com",
        computerId: "vm",
        computerName: "Test VM",
        phase: "choose",
        account: "Work",
        policy: "ask",
        onePasswordAvailable: false,
    };
    const login = vi.fn(async (command) => ({
        request: {
            ...request,
            phase: command.action === "submit" ? "review" : command.action === "complete" ? "complete" : "choose",
        },
    }));
    window.hermesDesktop = { krontermSurfaces: { computerManager: { login } } } as any;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const setInput = async (input: HTMLInputElement, value: string) =>
        act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    try {
        await act(async () => root.render(<SandboxLoginCard />));
        const dialog = document.querySelector("[role=dialog]") as HTMLElement;
        expect(dialog.textContent).toContain("Continue in VM browser");
        const remember = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]');
        expect(remember.checked).toBe(false);
        await act(async () => remember.click());
        expect(
            (dialog.querySelector('select[aria-label="Remembered sign-in permission"]') as HTMLSelectElement).value
        ).toBe("ask");
        const browser = [...dialog.querySelectorAll("button")].find(
            (button) => button.textContent === "Continue in VM browser"
        );
        await act(async () => browser.click());
        expect(document.querySelector("[role=dialog]")).toBeNull();
        await act(async () => host.querySelector("button").click());
        const reopened = document.querySelector("[role=dialog]") as HTMLElement;
        await setInput(reopened.querySelector("input:not([type])"), "fixture-user");
        await setInput(reopened.querySelector('input[type="password"]'), "fixture-secret");
        await act(async () =>
            reopened.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        const submission = login.mock.calls.find(([command]) => command.action === "submit")[0];
        expect(submission).toMatchObject({
            provider: "manual",
            sessionIds: ["chat", "stored-chat"],
            requestId: "request",
            password: "fixture-secret",
        });
        expect((reopened.querySelector('input[type="password"]') as HTMLInputElement).value).toBe("");
        expect(host.textContent).not.toContain("fixture-secret");
        const complete = [...reopened.querySelectorAll("button")].find((button) =>
            button.textContent.includes("I’ve signed in")
        );
        await act(async () => complete.click());
        expect(login.mock.calls.find(([command]) => command.action === "complete")[0]).toMatchObject({
            policy: "ask",
            remember: true,
            account: "Work",
        });
        expect(reopened.textContent).toContain("Sign-in returned to agent");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        delete window.hermesDesktop;
    }
});

it("shows only detected providers, opens the VM flow, and cancels from the header", async () => {
    let active = true;
    const request = {
        id: "provider-request",
        origin: "https://example.com",
        computerId: "vm",
        computerName: "Test VM",
        phase: "choose",
        account: "",
        policy: "ask",
        passwordVisible: false,
        providers: ["apple", "github"],
        onePasswordAvailable: false,
    };
    const login = vi.fn(async (command) => {
        if (command.action === "cancel") active = false;
        return {
            request: {
                ...request,
                phase: !active ? "cancelled" : command.action === "provider" ? "review" : "choose",
            },
        };
    });
    window.hermesDesktop = { krontermSurfaces: { computerManager: { login } } } as any;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dialog = () => document.querySelector("[role=dialog]");
    try {
        await act(async () => root.render(<SandboxLoginCard />));
        expect(dialog().querySelector("form")).toBeNull();
        expect(dialog().querySelector('button[aria-label="Continue with Google"]')).toBeNull();
        expect(dialog().querySelector('button[aria-label="Continue with Apple"]')).not.toBeNull();
        expect(dialog().textContent).not.toContain("You have control");
        await act(async () =>
            dialog().querySelector<HTMLButtonElement>('button[aria-label="Continue with GitHub"]').click()
        );
        expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ action: "provider", provider: "github" }));
        expect(dialog()).toBeNull();
        await act(async () => host.querySelector("button").click());
        const cancels = dialog().querySelectorAll<HTMLButtonElement>('button[aria-label="Cancel sign-in"]');
        expect(cancels).toHaveLength(1);
        await act(async () => cancels[0].click());
        expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ action: "cancel", requestId: request.id }));
        expect(dialog()).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        delete window.hermesDesktop;
    }
});
