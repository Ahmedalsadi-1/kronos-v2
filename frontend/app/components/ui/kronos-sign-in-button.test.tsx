// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemCenterOpenEvent } from "@/app/workspace/command-center-events";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronOSSignInButton } from "./kronos-sign-in-button";

const mock = vi.hoisted(() => ({
    status: {
        configured: true,
        account: { email: "test@example.com", avatarURL: "https://avatars.githubusercontent.com/u/123" },
    } as {
        configured: boolean;
        account: { email: string; avatarURL?: string } | null;
    },
    changed: undefined as (() => void) | undefined,
    open: vi.fn(),
    unsubscribe: vi.fn(),
}));
vi.mock("@/app/store/global", () => ({
    getApi: () => ({
        openKronosSignIn: mock.open,
        getKronosAccountStatus: async () => mock.status,
        onKronosAccountChanged: (callback: () => void) => {
            mock.changed = callback;
            return mock.unsubscribe;
        },
    }),
}));

it("shows the saved account and follows account changes without another login", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<KronOSSignInButton showName />));
        const button = host.querySelector("button");
        expect(host.querySelector("img").getAttribute("src")).toBe("https://avatars.githubusercontent.com/u/123");
        expect(button.textContent).toBe("test@example.com");
        expect(button.getAttribute("aria-label")).toBe("KronOS account: test@example.com");
        const settings = vi.fn();
        window.addEventListener(SystemCenterOpenEvent, settings, { once: true });
        await act(async () => button.click());
        expect(settings.mock.calls[0][0].detail).toEqual({ center: "control", section: "user" });
        expect(mock.open).not.toHaveBeenCalled();
        mock.status = { configured: true, account: null };
        await act(async () => mock.changed());
        expect(button.textContent).toBe("Sign in");
        expect(button.getAttribute("aria-label")).toBe("Sign in to KronOS");
        await act(async () => button.click());
        expect(mock.open).toHaveBeenCalledOnce();
    } finally {
        await act(async () => root.unmount());
        expect(mock.unsubscribe).toHaveBeenCalledOnce();
        host.remove();
        vi.unstubAllGlobals();
    }
});
