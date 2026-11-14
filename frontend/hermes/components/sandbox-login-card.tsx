// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useSessionView } from "@hermes/app/chat/session-view";
import { useStore } from "@nanostores/react";
import { X } from "lucide-react";
import { Dialog as LoginDialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxLoginProvider, SandboxLoginState, SandboxLoginUiCommand } from "../../types/sandbox-login";

import "./sandbox-login-card.css";

const ProviderLabels: Record<SandboxLoginProvider, string> = { google: "Google", apple: "Apple", github: "GitHub" };

export function SandboxLoginCard({ hudMode = false }: { hudMode?: boolean }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const mountLayer = useCallback(
        (layer: HTMLDivElement | null) => {
            if (!layer) return;
            if (layer.showPopover && !layer.matches(":popover-open")) layer.showPopover();
            const chat = hudMode ? null : anchor.current?.closest("[data-hermes-app]");
            if (!chat) return;
            const position = () => {
                const bounds = chat.getBoundingClientRect();
                layer.style.setProperty("--login-center-x", `${bounds.left + bounds.width / 2}px`);
                layer.style.setProperty("--login-center-y", `${bounds.top + bounds.height / 2}px`);
                layer.style.setProperty("--login-panel-width", `${bounds.width}px`);
                layer.style.setProperty("--login-panel-height", `${bounds.height}px`);
            };
            position();
            const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
            observer?.observe(chat);
            window.addEventListener("resize", position);
            return () => {
                observer?.disconnect();
                window.removeEventListener("resize", position);
                for (const name of ["center-x", "center-y", "panel-width", "panel-height"]) {
                    layer.style.removeProperty(`--login-${name}`);
                }
            };
        },
        [hudMode]
    );
    const view = useSessionView();
    const runtimeId = useStore(view.$runtimeId);
    const storedId = useStore(view.$storedId);
    const [request, setRequest] = useState<SandboxLoginState>();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [account, setAccount] = useState("");
    const [remember, setRemember] = useState(false);
    const [policy, setPolicy] = useState<"ask" | "automatic">("ask");
    const [accounts, setAccounts] = useState<{ id: string; vaultId: string; title: string }[]>([]);
    const [selected, setSelected] = useState("");
    const [browserRequest, setBrowserRequest] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const login = window.hermesDesktop?.krontermSurfaces?.computerManager?.login;
    const sessionIds = [...new Set([runtimeId, storedId].filter(Boolean))];
    useEffect(() => {
        if (!login) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        setRequest(undefined);
        setPassword("");
        const poll = async () => {
            try {
                const result = await login({ action: "poll", sessionIds });
                if (!disposed)
                    setRequest((previous) => result.request || (previous?.phase === "complete" ? previous : undefined));
            } catch {
                // A disconnected gateway must not put sign-in errors in every idle composer.
            } finally {
                if (!disposed) timer = setTimeout(poll, 1200);
            }
        };
        void poll();
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }, [login, runtimeId, storedId]);
    useEffect(() => {
        setUsername("");
        setPassword("");
        setAccount("");
        setRemember(false);
        setPolicy(request?.policy || "ask");
        setAccounts([]);
        setSelected("");
        setError("");
    }, [request?.id]);
    const act = async (command: Omit<SandboxLoginUiCommand, "sessionIds" | "requestId">) => {
        if (!login || !request || busy) return;
        setBusy(true);
        setError("");
        if (command.action === "submit") setPassword("");
        try {
            const result = await login({ ...command, requestId: request.id, sessionIds });
            if (result.request) setRequest(result.request);
            if ((command.action === "provider" || command.action === "signup") && result.request?.phase === "review") {
                setPassword("");
                setBrowserRequest(request.id);
            }
            if (result.accounts) {
                setAccounts(result.accounts);
                setSelected(result.accounts[0]?.id || "");
                if (!result.accounts.length) setError("No 1Password login matches this exact website.");
            }
            if (result.request?.phase === "complete") window.dispatchEvent(new Event("kronterm:computer-wake"));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Sign-in could not finish.");
        } finally {
            setBusy(false);
        }
    };
    if (!request || !login || request.phase === "cancelled" || request.phase === "unverified") return null;
    if (browserRequest === request.id && request.phase !== "complete") {
        return (
            <button type="button" className="sandbox-login-reopen" onClick={() => setBrowserRequest("")}>
                Open sign-in · Return control when done
            </button>
        );
    }
    const continueInBrowser = () => {
        setPassword("");
        setBrowserRequest(request.id);
    };
    const loading = busy || request.phase === "submitting";
    const close = () => {
        if (loading) return;
        if (request.phase === "complete") setRequest(undefined);
        else void act({ action: "cancel" });
    };
    const showPassword = request.passwordVisible !== false;
    const showVault = showPassword && request.onePasswordAvailable;
    const button = "sandbox-login-button";
    const input = "sandbox-login-input";
    return (
        <LoginDialog.Root open>
            <span ref={anchor} hidden />
            <LoginDialog.Portal>
                <div className="sandbox-login-layer" popover="manual" ref={mountLayer}>
                    <LoginDialog.Overlay className="sandbox-login-backdrop" />
                    <LoginDialog.Content
                        data-hermes-portal=""
                        className="sandbox-login-popup"
                        onOpenAutoFocus={(event) => {
                            event.preventDefault();
                            title.current?.focus({ preventScroll: true });
                        }}
                        onEscapeKeyDown={(event) => {
                            event.preventDefault();
                            close();
                        }}
                        onPointerDownOutside={(event) => event.preventDefault()}
                    >
                        <div className="sandbox-login-heading">
                            <LoginDialog.Title ref={title} tabIndex={-1}>
                                {request.phase === "complete"
                                    ? "Sign-in returned to agent"
                                    : request.registration
                                      ? "Create an account"
                                      : "Sign in to continue"}
                            </LoginDialog.Title>
                            <button
                                type="button"
                                className="sandbox-login-close"
                                aria-label={request.phase === "complete" ? "Dismiss" : "Cancel sign-in"}
                                disabled={loading}
                                onClick={close}
                            >
                                <X aria-hidden="true" size={18} />
                            </button>
                        </div>
                        <LoginDialog.Description className="mt-1 break-all text-xs">
                            {request.origin} · {request.computerName}
                        </LoginDialog.Description>
                        {request.memoryNotice && (
                            <p className="mt-2 text-xs" role="status">
                                {request.memoryNotice}
                            </p>
                        )}
                        {request.phase === "complete" ? (
                            <p className="mt-2 text-xs" role="status">
                                Your browser session stays on this computer. The agent can continue; it should verify
                                the website is signed in.
                            </p>
                        ) : (
                            <>
                                {showPassword && (
                                    <form
                                        className="sandbox-login-form"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void act({ action: "submit", provider: "manual", username, password });
                                        }}
                                    >
                                        <label className="block text-xs">
                                            Username or email
                                            <input
                                                className={`${input} mt-1`}
                                                autoComplete="off"
                                                placeholder="name@company.com"
                                                value={username}
                                                disabled={loading}
                                                onChange={(event) => setUsername(event.target.value)}
                                            />
                                        </label>
                                        <label className="mt-2 block text-xs">
                                            Password
                                            <input
                                                type="password"
                                                placeholder="Enter your password"
                                                className={`${input} mt-1`}
                                                autoComplete="off"
                                                value={password}
                                                disabled={loading}
                                                onChange={(event) => setPassword(event.target.value)}
                                            />
                                        </label>
                                        <button
                                            type="submit"
                                            className="sandbox-login-primary"
                                            disabled={loading || !password}
                                        >
                                            {loading ? "Working…" : "Login"}
                                        </button>
                                    </form>
                                )}
                                {showPassword && <div className="sandbox-login-divider">Or continue with</div>}
                                {showVault && (
                                    <button
                                        type="button"
                                        className={button}
                                        disabled={loading}
                                        onClick={() => void act({ action: "accounts" })}
                                    >
                                        Login with 1Password
                                    </button>
                                )}
                                {!!request.providers?.length && (
                                    <div className="sandbox-login-providers">
                                        {request.providers.map((provider) => (
                                            <button
                                                key={provider}
                                                type="button"
                                                className={button}
                                                aria-label={`Continue with ${ProviderLabels[provider]}`}
                                                disabled={loading}
                                                onClick={() => void act({ action: "provider", provider })}
                                            >
                                                {ProviderLabels[provider]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button type="button" className={button} disabled={loading} onClick={continueInBrowser}>
                                    Continue in VM browser
                                </button>
                                {request.signUpAvailable && (
                                    <div className="sandbox-login-divider">
                                        <button
                                            type="button"
                                            className="cursor-pointer underline"
                                            disabled={loading}
                                            onClick={() => void act({ action: "signup" })}
                                        >
                                            Create an account
                                        </button>
                                    </div>
                                )}
                                {accounts.length > 0 && (
                                    <div className="mt-2 flex gap-2">
                                        <select
                                            aria-label="1Password account"
                                            className={input}
                                            value={selected}
                                            disabled={loading}
                                            onChange={(event) => setSelected(event.target.value)}
                                        >
                                            {accounts.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.title}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className={button}
                                            disabled={loading || !selected}
                                            onClick={() => {
                                                const item = accounts.find((item) => item.id === selected);
                                                void act({
                                                    action: "submit",
                                                    provider: "1password",
                                                    itemId: item.id,
                                                    vaultId: item.vaultId,
                                                });
                                            }}
                                        >
                                            Use account
                                        </button>
                                    </div>
                                )}
                                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        disabled={loading}
                                        onChange={(event) => setRemember(event.target.checked)}
                                    />
                                    Remember this account on this computer
                                </label>
                                {remember && (
                                    <div className="mt-2 flex flex-col gap-2">
                                        <label className="text-xs">
                                            Account label
                                            <input
                                                className={`${input} mt-1`}
                                                value={account}
                                                placeholder={request.account || "Work or personal account"}
                                                disabled={loading}
                                                onChange={(event) => setAccount(event.target.value)}
                                            />
                                        </label>
                                        <select
                                            aria-label="Remembered sign-in permission"
                                            className={input}
                                            value={policy}
                                            disabled={loading}
                                            onChange={(event) => setPolicy(event.target.value as "ask" | "automatic")}
                                        >
                                            <option value="ask">Ask before signing in</option>
                                            <option value="automatic">Automatic for this website and account</option>
                                        </select>
                                        <p className="text-xs text-(--ui-text-secondary)">
                                            Saves your sign-in preference, never your password.
                                        </p>
                                    </div>
                                )}
                                {(error || request.error) && (
                                    <p role="alert" className="mt-2 text-xs text-red-400">
                                        {error || request.error}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={button}
                                        disabled={loading || (remember && !(account.trim() || request.account))}
                                        onClick={() =>
                                            void act({
                                                action: "complete",
                                                remember,
                                                policy,
                                                account: account.trim() || request.account,
                                            })
                                        }
                                    >
                                        I’ve signed in · Return to agent
                                    </button>
                                </div>
                            </>
                        )}
                    </LoginDialog.Content>
                </div>
            </LoginDialog.Portal>
        </LoginDialog.Root>
    );
}
