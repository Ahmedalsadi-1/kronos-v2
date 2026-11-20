// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import { useState } from "react";
import { KronOSAccountAvatar } from "./kronos-account-avatar";
import { useKronosAccount } from "./use-kronos-account";

export function KronOSAccountSettings() {
    const { status, error } = useKronosAccount();
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState("");
    const account = status?.account;
    return (
        <section className="mx-auto w-full max-w-2xl space-y-6 p-6" aria-labelledby="kronos-user-title">
            <div>
                <h2 id="kronos-user-title" className="text-lg font-semibold">
                    Profile
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Your KronOS account and browser sessions.</p>
            </div>
            {(error || failure) && (
                <p role="alert" className="text-sm text-red-500">
                    {error || failure}
                </p>
            )}
            {!status && !error && <p role="status">Loading account...</p>}
            {status && (
                <div className="space-y-5 rounded-xl border border-border p-5">
                    <div className="flex items-center gap-4">
                        <KronOSAccountAvatar account={account} className="size-14" />
                        <div className="min-w-0">
                            <h2 className="font-medium">
                                {account?.name || (account ? "KronOS account" : "Welcome to KronOS")}
                            </h2>
                            <p className="break-all text-sm text-muted-foreground">
                                {account?.email || "Sign in to your account."}
                            </p>
                            {account && <p className="mt-1 text-xs text-muted-foreground">Signed in</p>}
                        </div>
                    </div>
                    {account ? (
                        <button
                            type="button"
                            disabled={busy}
                            className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
                            onClick={async () => {
                                setBusy(true);
                                setFailure("");
                                try {
                                    await getApi().signOutKronosAccount();
                                } catch {
                                    setFailure("Could not sign out. Please try again.");
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            {busy ? "Signing out..." : "Sign out of KronOS"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="cursor-pointer rounded-md bg-accent/80 px-4 py-2 text-sm text-primary hover:bg-accent"
                            onClick={() => getApi().openKronosSignIn()}
                        >
                            Sign in to KronOS
                        </button>
                    )}
                </div>
            )}
            <div className="space-y-2 rounded-xl border border-border p-5">
                <h2 className="font-medium">Browser sign-ins</h2>
                <p className="text-sm text-muted-foreground">
                    Sign in to Gmail and other websites inside the KronOS browser. Regular browser profiles keep their
                    cookies between launches; private profiles do not.
                </p>
                <p className="text-sm text-muted-foreground">
                    Your KronOS account and website sessions are separate. Signing out of KronOS leaves your website
                    sessions unchanged.
                </p>
                <button
                    type="button"
                    className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm hover:bg-foreground/5"
                    onClick={() => {
                        void createBlock({ meta: { view: "web", url: "https://mail.google.com/" } }).catch(() => {
                            setFailure("Could not open Gmail. Please try again.");
                        });
                    }}
                >
                    Open Gmail in KronOS browser
                </button>
            </div>
        </section>
    );
}
