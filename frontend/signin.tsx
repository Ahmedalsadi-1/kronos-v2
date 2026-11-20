// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import logo from "@/app/asset/logo.svg?url";
import type { AccountCommand, AccountStatus } from "@/types/kronos-account";
import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./app/components/ui/modern-stunning-sign-in.css";
import "./tailwindsetup.css";

declare global {
    interface Window {
        kronosAccount: (command: AccountCommand) => Promise<AccountStatus>;
    }
}

const Primary =
    "w-full cursor-pointer rounded-xl bg-[var(--signin-button)] px-4 py-2.5 text-sm font-medium text-[var(--signin-button-text)] disabled:opacity-50";
const Secondary =
    "w-full cursor-pointer rounded-xl border border-[var(--signin-border)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--signin-field)] disabled:opacity-50";
const Input = "w-full rounded-xl border border-[var(--signin-border)] bg-[var(--signin-field)] px-4 py-2.5 text-sm";

function KronOSAccount() {
    const [status, setStatus] = useState<AccountStatus>();
    const [busy, setBusy] = useState<AccountCommand["action"]>();
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        void window.kronosAccount({ action: "status" }).then(setStatus, () => {
            setError("Could not open account settings.");
        });
    }, []);

    async function run(command: AccountCommand) {
        setError("");
        setBusy(command.action);
        try {
            const next = await window.kronosAccount(command);
            setStatus(next);
            if (command.action === "send-code") setCodeSent(true);
            if (command.action === "verify-code" || command.action === "sign-out") {
                setCode("");
                setCodeSent(false);
            }
        } catch (failure) {
            const message =
                failure instanceof Error
                    ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
                    : "Sign-in could not complete.";
            setError(message);
        } finally {
            setBusy(undefined);
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void run(codeSent ? { action: "verify-code", code } : { action: "send-code", email });
    }

    return (
        <main className="kronos-sign-in flex min-h-dvh items-center justify-center px-6 py-5">
            <section className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--signin-border)] bg-[var(--signin-card)] p-6 shadow-2xl">
                <img src={logo} alt="" className="size-9" />
                <h1 className="text-2xl font-semibold tracking-tight">
                    {status?.account ? "KronOS account" : "Sign in to KronOS"}
                </h1>
                {status?.account ? (
                    <>
                        <p role="status" className="break-all text-sm">
                            {status.account.email || "Signed in"}
                        </p>
                        <button type="button" className={Primary} onClick={() => window.close()}>
                            Done
                        </button>
                        <button
                            type="button"
                            className={Secondary}
                            disabled={Boolean(busy)}
                            onClick={() => void run({ action: "sign-out" })}
                        >
                            Sign out
                        </button>
                    </>
                ) : status?.configured ? (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className={Secondary}
                                disabled={Boolean(busy)}
                                onClick={() => void run({ action: "provider", provider: "google" })}
                            >
                                Google
                            </button>
                            <button
                                type="button"
                                className={Secondary}
                                disabled={Boolean(busy)}
                                onClick={() => void run({ action: "provider", provider: "github" })}
                            >
                                GitHub
                            </button>
                        </div>
                        {busy === "provider" && (
                            <div className="flex items-center justify-between gap-2 text-xs" role="status">
                                Finish signing in in your browser.
                                <button
                                    type="button"
                                    className="cursor-pointer underline"
                                    onClick={() => void window.kronosAccount({ action: "cancel" })}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                        <form className="grid gap-2" onSubmit={submit}>
                            {codeSent ? (
                                <>
                                    <label className="grid gap-1 text-sm">
                                        Code sent to {email}
                                        <input
                                            className={Input}
                                            disabled={Boolean(busy)}
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            required
                                            pattern="[0-9]{6,10}"
                                            value={code}
                                            onChange={(event) => setCode(event.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="justify-self-start cursor-pointer text-xs underline"
                                        disabled={Boolean(busy)}
                                        onClick={() => {
                                            setCodeSent(false);
                                            setCode("");
                                            setError("");
                                        }}
                                    >
                                        Use a different email
                                    </button>
                                </>
                            ) : (
                                <label className="grid gap-1 text-sm">
                                    Email address
                                    <input
                                        type="email"
                                        className={Input}
                                        required
                                        autoComplete="email"
                                        disabled={Boolean(busy)}
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                    />
                                </label>
                            )}
                            <button className={Primary} disabled={Boolean(busy)} type="submit">
                                {codeSent ? "Verify code" : "Email me a sign-in code"}
                            </button>
                        </form>
                    </>
                ) : status ? (
                    <p className="text-sm">
                        Account sign-in is unavailable in this build. You can still use your local workspace.
                    </p>
                ) : (
                    !error && (
                        <p role="status" className="text-sm">
                            Checking account…
                        </p>
                    )
                )}
                {error && (
                    <p role="alert" className="break-words text-sm text-[var(--signin-error)]">
                        {error}
                    </p>
                )}
                {!status?.account && (
                    <button type="button" className={Secondary} onClick={() => window.close()}>
                        Continue locally
                    </button>
                )}
            </section>
        </main>
    );
}

createRoot(document.getElementById("signin-root")).render(<KronOSAccount />);
