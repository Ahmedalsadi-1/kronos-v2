// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import type { BrowserAccountCommand, BrowserAccountState } from "@/types/browser-account";
import type { SandboxLoginProvider } from "@/types/sandbox-login";
import type { WebviewTag } from "electron";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { BrowserAccountRequestEvent } from "./browser-account-handoff";
import "./browser-account-panel.css";

const ProviderLabels: Record<SandboxLoginProvider, string> = { google: "Google", apple: "Apple", github: "GitHub" };

type Inspection = { page: string; state: BrowserAccountState };
type Flow = { origin: string; registration: boolean; inBrowser: boolean; canRemember: boolean };

export function BrowserAccountPanel({ guestRef, ready }: { guestRef: RefObject<WebviewTag>; ready: boolean }) {
    const [inspection, setInspection] = useState<Inspection>();
    const [flow, setFlow] = useState<Flow>();
    const [remember, setRemember] = useState(false);
    const [account, setAccount] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [dismissed, setDismissed] = useState("");
    const panelTitle = useRef<HTMLHeadingElement>(null);
    const titleId = useId();

    const begin = (detail: Inspection) => {
        const guest = guestRef.current;
        if (!guest || guest.getURL() !== detail.page) return;
        guest.setAttribute("data-browser-account-private", "");
        setInspection(detail);
        setFlow(
            (previous) =>
                previous ?? {
                    origin: detail.state.origin,
                    registration: detail.state.registration,
                    inBrowser: false,
                    canRemember: detail.state.canRemember,
                }
        );
        setAccount(detail.state.rememberedAccount ?? "");
        setError("");
    };

    useEffect(() => {
        const guest = guestRef.current;
        const api = getApi()?.browserAccount;
        if (!ready || !guest || !api) return;
        let disposed = false;
        let revision = 0;
        let timer: ReturnType<typeof setTimeout>;
        const inspect = async (attempt = 0) => {
            clearTimeout(timer);
            const sequence = ++revision;
            try {
                const page = guest.getURL();
                const state = await api({ guestId: guest.getWebContentsId(), action: "inspect" });
                if (disposed || sequence !== revision || page !== guest.getURL()) return;
                setInspection(state ? { page, state } : undefined);
                if (attempt < 2) timer = setTimeout(() => void inspect(attempt + 1), 1500);
            } catch {
                if (!disposed && sequence === revision) setInspection(undefined);
            }
        };
        const onNavigate = () => void inspect();
        const request = (event: Event) => {
            const detail = (event as CustomEvent<Inspection>).detail;
            if (detail?.state.status === "required" && detail.page !== dismissed) begin(detail);
        };
        guest.addEventListener("did-stop-loading", onNavigate);
        guest.addEventListener("did-navigate-in-page", onNavigate);
        guest.addEventListener(BrowserAccountRequestEvent, request);
        void inspect();
        return () => {
            disposed = true;
            clearTimeout(timer);
            guest.removeEventListener("did-stop-loading", onNavigate);
            guest.removeEventListener("did-navigate-in-page", onNavigate);
            guest.removeEventListener(BrowserAccountRequestEvent, request);
        };
    }, [ready, guestRef, dismissed]);

    useEffect(() => {
        if (flow && !flow.inBrowser) panelTitle.current?.focus({ preventScroll: true });
    }, [flow]);

    useEffect(() => {
        const guest = guestRef.current;
        return () => guest?.removeAttribute("data-browser-account-private");
    }, [guestRef, ready]);

    const end = () => {
        const guest = guestRef.current;
        guest?.removeAttribute("data-browser-account-private");
        setDismissed(guest?.getURL() ?? "");
        setFlow(undefined);
        setRemember(false);
        setError("");
    };

    const inBrowser = () => {
        setFlow((previous) => previous && { ...previous, inBrowser: true });
        guestRef.current?.focus();
    };

    const run = async (action: "provider" | "signup", provider?: SandboxLoginProvider) => {
        if (!flow || !inspection || busy) return;
        setBusy(true);
        setError("");
        try {
            const guestId = guestRef.current.getWebContentsId();
            const command: BrowserAccountCommand =
                action === "provider"
                    ? { guestId, action, provider, page: inspection.page }
                    : { guestId, action, page: inspection.page };
            await getApi().browserAccount(command);
            if (action === "signup")
                setFlow((previous) => previous && { ...previous, registration: true, inBrowser: true });
            else inBrowser();
            guestRef.current?.focus();
        } catch {
            setError("That option could not open. You can continue on the website.");
        } finally {
            setBusy(false);
        }
    };

    const finish = async () => {
        if (!flow || busy) return;
        setBusy(true);
        setError("");
        try {
            const guestId = guestRef.current.getWebContentsId();
            const state = await getApi().browserAccount({ guestId, action: "inspect" });
            if (state?.status === "required") {
                setError("The website still shows an account or verification step.");
                return;
            }
            if (remember) {
                try {
                    await getApi().browserAccount({ guestId, action: "remember", origin: flow.origin, account });
                } catch {
                    setError("Couldn’t remember this account. Uncheck Remember to return control.");
                    return;
                }
            }
            end();
        } catch {
            setError("Couldn’t check the browser. Try again when the page finishes loading.");
        } finally {
            setBusy(false);
        }
    };

    const currentState = inspection?.state;
    const state = !flow || currentState?.origin === flow.origin ? currentState : undefined;
    const offerSignUp = state?.signUpAvailable && state.status !== "authenticated";
    if (!flow) {
        if (!inspection || (!offerSignUp && state.status !== "required")) return null;
        return (
            <button className="browser-account-chip" type="button" onClick={() => begin(inspection)}>
                {state.registration || state.status !== "required" ? "Create an account" : "Sign-in options"}
            </button>
        );
    }

    if (flow.inBrowser) {
        return (
            <div className="browser-account-handoff">
                <button type="button" onClick={() => setFlow({ ...flow, inBrowser: false })}>
                    Account options
                </button>
                <button type="button" disabled={busy || (remember && !account.trim())} onClick={() => void finish()}>
                    Return to agent
                </button>
                <button type="button" aria-label="Cancel account handoff" disabled={busy} onClick={end}>
                    <X size={16} aria-hidden="true" />
                </button>
                {error && <span role="alert">{error}</span>}
            </div>
        );
    }

    const registration = flow.registration || state?.registration;
    return (
        <div className="browser-account-layer">
            <section
                role="dialog"
                aria-labelledby={titleId}
                className="browser-account-card"
                onKeyDown={(event) => {
                    if (event.key === "Escape" && !busy) {
                        event.stopPropagation();
                        end();
                    }
                }}
            >
                <h2 ref={panelTitle} tabIndex={-1} id={titleId}>
                    {registration
                        ? "Create an account"
                        : state?.status === "required"
                          ? "Sign in to continue"
                          : "Account options"}
                </h2>
                <p>{flow.origin}</p>
                <button
                    type="button"
                    className="browser-account-close"
                    aria-label="Cancel account handoff"
                    disabled={busy}
                    onClick={end}
                >
                    <X size={18} aria-hidden="true" />
                </button>
                <button className="browser-account-primary" type="button" disabled={busy} onClick={inBrowser}>
                    {registration ? "Continue signing up on the website" : "Continue on the website"}
                </button>
                {!!state?.providers.length && (
                    <div className="browser-account-providers">
                        {state.providers.map((provider) => (
                            <button
                                key={provider}
                                type="button"
                                disabled={busy}
                                aria-label={`Continue with ${ProviderLabels[provider]}`}
                                onClick={() => void run("provider", provider)}
                            >
                                {ProviderLabels[provider]}
                            </button>
                        ))}
                    </div>
                )}
                {offerSignUp && (
                    <section className="browser-account-signup" aria-label="Sign up">
                        <button type="button" disabled={busy} onClick={() => void run("signup")}>
                            Create an account
                        </button>
                    </section>
                )}
                {flow.canRemember && (
                    <label className="browser-account-remember">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(event) => setRemember(event.target.checked)}
                        />
                        Remember this account on this computer
                    </label>
                )}
                {remember && (
                    <label className="browser-account-label">
                        Account label
                        <input value={account} maxLength={160} onChange={(event) => setAccount(event.target.value)} />
                    </label>
                )}
                {error && <p role="alert">{error}</p>}
                <button type="button" disabled={busy || (remember && !account.trim())} onClick={() => void finish()}>
                    Return to agent
                </button>
            </section>
        </div>
    );
}
