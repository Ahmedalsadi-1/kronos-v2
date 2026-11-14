// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Runs inside the browser page. Only fixed labels cross back to the app.
export const BrowserLoginSignals = `() => {
    const visible = (element) => element.getClientRects().length &&
        getComputedStyle(element).visibility === "visible" &&
        !element.closest("[hidden], [inert], [aria-hidden=true]");
    const usable = (element) => visible(element) && !element.matches(":disabled, [aria-disabled=true]");
    const label = (element) =>
        (element.getAttribute("aria-label") || element.innerText || element.textContent || (element.type === "submit" && element.value) || "").trim().replace(/\\s+/g, " ");
    const controls = [...document.querySelectorAll("button, a[href], [role=button], input[type=submit]")].filter(usable);
    const providers = {};
    for (const control of controls) {
        const match = label(control).match(/^(?:sign[ -]?(?:in|up)|log[ -]?in|continue)\\s+(?:with|using)\\s+(google|apple|github)(?:\\b|$)/i);
        if (match) providers[match[1].toLowerCase()] ??= control;
    }
    for (const frame of document.querySelectorAll("iframe[src]")) {
        if (!visible(frame) || !URL.canParse(frame.src)) continue;
        const src = new URL(frame.src);
        if (src.origin === "https://accounts.google.com" && src.pathname === "/gsi/button")
            providers.google ??= frame;
    }
    const passwords = [...document.querySelectorAll("input[type=password]")].filter(usable);
    const field = passwords.length === 1 ? passwords[0] : null;
    const form = field?.form;
    const registrationLabel = /^(?:sign[ -]?up|register|join now|create (?:an? |your |new )?account)$/i;
    const registrationForm = controls.some((control) => registrationLabel.test(label(control)) &&
        (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) &&
        control.type === "submit" && control.form?.querySelector("input"));
    const registration = registrationForm ||
        /(?:^|\\/)(?:signup|sign-up|register|registration|join)\\/?$/i.test(location.pathname);
    const passwordVisible = Boolean(!registration && field && field.autocomplete !== "new-password" && form &&
        new URL(form.action, location.href).origin === location.origin);
    const signUpControl = registration ? null : controls.find((control) =>
        registrationLabel.test(label(control)) && !control.closest("form") &&
        (control instanceof HTMLAnchorElement
            ? /^https:/.test(control.href)
            : !control.matches("input[type=submit]") && !(control instanceof HTMLButtonElement && control.form && control.type === "submit"))
    );
    const signInPage = /(?:^|\\/)(?:login|log-in|signin|sign-in|authwall)\\/?$/i.test(location.pathname);
    const logout = controls.some((control) => /^(?:sign[ -]?out|log[ -]?out)$/i.test(label(control)));
    const challenge = [...document.querySelectorAll("input[autocomplete=one-time-code]")].some(usable) ||
        /(?:^|\\/)(?:challenge|checkpoint|mfa|verify|two-factor)(?:\\/|$)/i.test(location.pathname);
    return {
        passwordVisible,
        autoPrompt: passwordVisible || registrationForm || Object.keys(providers).length > 0,
        passwordField: passwordVisible ? field : null,
        status: passwordVisible || registrationForm || challenge || Object.keys(providers).length
            ? "required" : logout ? "authenticated" : registration || signInPage ? "required" : "unknown",
        providers,
        registration,
        signUpControl,
    };
}`;
