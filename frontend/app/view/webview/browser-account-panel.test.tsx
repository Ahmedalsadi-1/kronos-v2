// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserAccountRequestEvent, checkBrowserAccountHandoff } from "./browser-account-handoff";
import { BrowserAccountPanel } from "./browser-account-panel";

const api = vi.hoisted(() => ({ browserAccount: vi.fn() }));
vi.mock("@/app/store/global", () => ({ getApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps the widget private through signup and releases it after the user returns control", async () => {
    let page = "https://example.com/login";
    let state = {
        origin: "https://example.com",
        status: "required",
        registration: false,
        signUpAvailable: true,
        providers: ["google"],
        canRemember: true,
    };
    api.browserAccount.mockImplementation(async (command) => {
        if (command.action === "signup") page = "https://example.com/signup";
        return command.action === "inspect" ? state : undefined;
    });
    const host = document.createElement("div");
    const guest = document.createElement("webview");
    Object.assign(guest, { getURL: () => page, getWebContentsId: () => 1 });
    const panel = document.createElement("div");
    host.append(guest, panel);
    document.body.append(host);
    const root = createRoot(panel);
    const button = (label: string) => [...panel.querySelectorAll("button")].find((item) => item.textContent === label);
    try {
        await act(async () => root.render(<BrowserAccountPanel guestRef={{ current: guest as any }} ready />));
        expect(panel.querySelector("[role=dialog]")).toBeNull();
        await act(async () =>
            guest.dispatchEvent(new CustomEvent(BrowserAccountRequestEvent, { detail: { page, state } }))
        );
        expect(() => checkBrowserAccountHandoff(host)).toThrow("finish signing in");
        expect(panel.querySelector('button[aria-label="Continue with Google"]')).not.toBeNull();
        expect(panel.querySelector('button[aria-label="Continue with GitHub"]')).toBeNull();
        await act(async () => button("Create an account").click());
        expect(panel.querySelector("[role=dialog]")).toBeNull();
        expect(() => checkBrowserAccountHandoff(host)).toThrow("finish signing in");
        state = { ...state, status: "authenticated", signUpAvailable: false, providers: [] };
        await act(async () => button("Return to agent").click());
        expect(() => checkBrowserAccountHandoff(host)).not.toThrow();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
