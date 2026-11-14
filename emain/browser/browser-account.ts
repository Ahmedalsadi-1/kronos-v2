// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WebContents } from "electron";
import { createHash } from "node:crypto";
import type { BrowserAccountCommand, BrowserAccountState } from "../../frontend/types/browser-account";
import { SandboxLoginProviders } from "../../frontend/types/sandbox-login";
import { BrowserLoginSignals } from "../computer-plugins/browser-login-signals";
import { getLoginPreferences } from "../login-preferences-store";

export async function browserAccount(guest: WebContents, command: BrowserAccountCommand): Promise<BrowserAccountState> {
    const unavailable = () => {
        if (command.action !== "inspect")
            throw new Error("The current browser page is unavailable for this account action.");
        return undefined;
    };
    const current = guest.getURL();
    let page: URL;
    try {
        page = new URL(current);
    } catch {
        return unavailable();
    }
    if (page.protocol !== "https:" || page.username || page.password) return unavailable();

    if (command.action === "provider" || command.action === "signup") {
        if (
            command.page !== current ||
            (command.action === "provider" && !SandboxLoginProviders.includes(command.provider))
        )
            throw new Error("The browser page changed. Check the available options again.");
        const provider = JSON.stringify(command.action === "provider" ? command.provider : null);
        const opened = await guest.executeJavaScript(
            `(() => {
                if (location.href !== ${JSON.stringify(current)}) return false;
                const {providers,signUpControl} = (${BrowserLoginSignals})();
                const provider = ${provider};
                const control = provider === null ? signUpControl : providers[provider];
                if (!control) return false;
                if (control instanceof HTMLIFrameElement) control.focus();
                else control.click();
                return true;
            })()`,
            true
        );
        if (!opened) throw new Error("That account option is no longer available on this page.");
        return undefined;
    }
    if (command.action !== "inspect" && command.action !== "remember")
        throw new Error("Unknown browser account action.");

    const state = await guest.executeJavaScript(`(() => {
        if (location.href !== ${JSON.stringify(current)}) return null;
        const {status,registration,signUpControl,providers} = (${BrowserLoginSignals})();
        return {status, registration, signUpAvailable: !!signUpControl, providers: Object.keys(providers)};
    })()`);
    if (!state || guest.getURL() !== current || !["required", "authenticated", "unknown"].includes(state.status))
        return unavailable();
    const storagePath = guest.session.storagePath;
    const key = storagePath ? "browser:" + createHash("sha256").update(storagePath).digest("hex") : undefined;
    if (command.action === "remember") {
        if (!key || command.origin !== page.origin || state.status === "required")
            throw new Error("Finish signing in on the original site before remembering this account.");
        if (typeof command.account !== "string" || !command.account.trim() || command.account.trim().length > 160)
            throw new Error("Enter an account label to remember this sign-in.");
        getLoginPreferences().remember(
            { origin: page.origin, computerId: key, account: command.account.trim(), policy: "ask" },
            true
        );
        return undefined;
    }
    let rememberedAccount: string;
    if (key && state.status === "required") {
        try {
            const saved = getLoginPreferences().list(key, page.origin);
            if (saved.length === 1) rememberedAccount = saved[0].account;
        } catch {
            // The current sign-in must remain usable even when the old keychain entry is unavailable.
        }
    }
    return {
        origin: page.origin,
        status: state.status,
        registration: state.registration === true,
        signUpAvailable: state.signUpAvailable === true,
        providers: SandboxLoginProviders.filter(
            (provider) => Array.isArray(state.providers) && state.providers.includes(provider)
        ),
        canRemember: Boolean(key),
        rememberedAccount,
    };
}
