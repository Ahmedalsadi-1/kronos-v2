// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type WindowWithElectronApi = Window & { api?: unknown };

const hasElectronApi = (window as WindowWithElectronApi).api != null;

function reportBootstrapError(error: unknown): void {
    const elem = document.getElementById("main");
    if (elem) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        const pre = document.createElement("pre");
        pre.textContent = message;
        pre.style.cssText =
            "padding:24px;color:#991b1b;background:#fff1f2;height:100vh;white-space:pre-wrap;font:13px ui-monospace,monospace";
        elem.replaceChildren(pre);
    }
    console.error("Renderer bootstrap failed", error);
    const button = document.createElement("button");
    button.textContent = "Reload KronTerm";
    button.style.cssText = "position:fixed;bottom:24px;left:24px;padding:8px 16px;cursor:pointer";
    button.onclick = () => window.location.reload();
    elem?.append(button);
}

const RecoveryKey = "kronterm.renderer-bootstrap-recovery";
function handleBootstrapError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (
        import.meta.env.DEV &&
        /Failed to fetch dynamically imported module|Importing a module script failed/.test(message)
    ) {
        try {
            const lastRecovery = Number(sessionStorage.getItem(RecoveryKey) ?? 0);
            if (Date.now() - lastRecovery > 60_000) {
                sessionStorage.setItem(RecoveryKey, String(Date.now()));
                window.location.reload();
                return;
            }
        } catch {
            // Recovery must still be visible when browser storage is unavailable.
        }
    }
    reportBootstrapError(error);
}

if (hasElectronApi) {
    import("./wave").catch(handleBootstrapError);
} else {
    import("./acp-browser-preview").catch(handleBootstrapError);
}
