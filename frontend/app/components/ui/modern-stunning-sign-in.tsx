"use client";

import Logo from "@/app/asset/logo.svg?url";
import { ArrowRight, Check, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import "./modern-stunning-sign-in.css";

const EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FieldClass =
    "w-full rounded-xl border border-[var(--signin-border)] bg-[var(--signin-field)] px-4 py-3 text-sm text-[var(--signin-text)] placeholder:text-[var(--signin-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signin-focus)]";

export function SignIn1({ onClose }: { onClose?: () => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [complete, setComplete] = useState(false);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!email.trim() || !password) {
            setError("Enter a test email and password.");
            return;
        }
        if (!EmailPattern.test(email.trim())) {
            setError("Enter a valid email address.");
            return;
        }
        setEmail("");
        setPassword("");
        setError("");
        setComplete(true);
    };

    return (
        <main className="flex min-h-dvh w-full items-center justify-center kronos-sign-in px-5 py-8">
            <div className="w-full max-w-sm rounded-3xl border border-[var(--signin-border)] bg-[var(--signin-card)] p-7 shadow-2xl sm:p-8">
                <div className="mb-5 grid size-12 place-items-center rounded-xl bg-[var(--signin-field)]">
                    <img src={Logo} alt="" className="size-9 object-contain" />
                </div>
                <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in to KronOS</h1>
                <p className="mb-6 text-sm leading-relaxed text-[var(--signin-muted)]">
                    Test the sign-in flow with sample values. Entries stay in this window.
                </p>
                {complete ? (
                    <p role="status" className="mb-6 flex items-center gap-2 text-sm text-[var(--signin-success)]">
                        <Check size={16} aria-hidden="true" /> Test sign-in complete.
                    </p>
                ) : (
                    <form noValidate onSubmit={submit} className="flex flex-col gap-4" autoComplete="off">
                        <label className="grid gap-1.5 text-sm">
                            Test email
                            <input
                                className={FieldClass}
                                type="email"
                                value={email}
                                placeholder="demo@example.com"
                                autoComplete="off"
                                onChange={(event) => setEmail(event.target.value)}
                            />
                        </label>
                        <label className="grid gap-1.5 text-sm">
                            Test password
                            <input
                                className={FieldClass}
                                type="password"
                                value={password}
                                placeholder="Sample password"
                                autoComplete="new-password"
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </label>
                        {error && (
                            <p role="alert" className="text-sm text-[var(--signin-error)]">
                                {error}
                            </p>
                        )}
                        <button
                            type="submit"
                            className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--signin-button)] px-4 py-3 text-sm font-medium text-[var(--signin-button-text)] hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signin-focus)]"
                        >
                            <LogIn size={16} aria-hidden="true" /> Test sign-in
                        </button>
                    </form>
                )}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm text-[var(--signin-text)] hover:bg-[var(--signin-field)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signin-focus)]"
                    >
                        {complete ? "Continue to KronOS" : "Continue without signing in"}{" "}
                        <ArrowRight size={15} aria-hidden="true" />
                    </button>
                )}
            </div>
        </main>
    );
}
