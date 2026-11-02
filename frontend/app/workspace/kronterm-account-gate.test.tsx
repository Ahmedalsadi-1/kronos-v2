// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronTermAccountGate } from "./kronterm-account-gate";

const api = vi.hoisted(() => ({ getKronTermAccountStatus: vi.fn(), hermesApi: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps existing accounts in the workspace without another signup", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    api.getKronTermAccountStatus.mockResolvedValue({ configured: true, encryptionAvailable: true });
    try {
        await act(async () => root.render(<KronTermAccountGate />));
        expect(api.getKronTermAccountStatus).toHaveBeenCalledOnce();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(api.hermesApi).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        vi.clearAllMocks();
    }
});

it("uses the shared first-run form and system keychain feedback", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    api.getKronTermAccountStatus.mockResolvedValue({ configured: false, encryptionAvailable: false });
    try {
        await act(async () => root.render(<KronTermAccountGate />));
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog).toBeTruthy();
        expect(dialog.querySelector('[aria-label="KronTerm account setup"]')).toBeTruthy();
        expect(dialog.textContent).toContain("Unlock your system keychain");
        expect(dialog.querySelector('input[name="email"]')).toBeTruthy();
        expect(dialog.querySelector('input[name="password"]')).toBeTruthy();
        expect(api.hermesApi).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        vi.clearAllMocks();
    }
});
