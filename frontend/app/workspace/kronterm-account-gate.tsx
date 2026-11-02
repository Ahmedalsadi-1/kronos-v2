// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { WorkflowAccount } from "@hermes/app/workflows/account";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

export function KronTermAccountGate() {
    const [required, setRequired] = useState(false);
    const [encryptionAvailable, setEncryptionAvailable] = useState(true);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const api = getApi();
        if (!api?.getKronTermAccountStatus) return;
        void api
            .getKronTermAccountStatus()
            .then((status) => {
                if (!active) return;
                setRequired(!status.configured);
                setEncryptionAvailable(status.encryptionAvailable);
                setError("");
            })
            .catch(() => {
                if (active) setError("KronTerm could not check your account connection.");
            });
        const changed = () => setAttempt((value) => value + 1);
        window.addEventListener("kronterm:account-connected", changed);
        return () => {
            active = false;
            window.removeEventListener("kronterm:account-connected", changed);
        };
    }, [attempt]);
    return (
        <>
            {error && (
                <div
                    role="alert"
                    className="fixed right-4 top-16 z-[5000] max-w-sm rounded border border-border bg-background p-3 text-sm text-foreground shadow-lg"
                >
                    <p>{error}</p>
                    <button
                        type="button"
                        className="mt-2 cursor-pointer underline"
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        Retry account connection
                    </button>
                </div>
            )}
            <Dialog.Root open={required}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-[5000] bg-black/15" />
                    <Dialog.Content
                        aria-describedby="kronterm-account-description"
                        onEscapeKeyDown={(event) => event.preventDefault()}
                        onPointerDownOutside={(event) => event.preventDefault()}
                        className="fixed left-1/2 top-1/2 z-[5001] max-h-[calc(100dvh-96px)] w-[min(440px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background px-3 py-3 text-foreground shadow-2xl focus:outline-none"
                    >
                        <Dialog.Title className="sr-only">KronTerm account setup</Dialog.Title>
                        <Dialog.Description id="kronterm-account-description" className="sr-only">
                            Create one account for KronTerm and your workflows.
                        </Dialog.Description>
                        {!encryptionAvailable && (
                            <p role="status" className="px-4 pt-3 text-xs leading-relaxed text-foreground/70">
                                Unlock your system keychain to save your account securely.
                            </p>
                        )}
                        <WorkflowAccount
                            connect={(account) =>
                                getApi().hermesApi({
                                    path: "/api/kronterm/n8n/command",
                                    method: "POST",
                                    body: { operation: "account", account },
                                    timeoutMs: 125000,
                                })
                            }
                            onConnected={() => {
                                setRequired(false);
                                window.dispatchEvent(new CustomEvent("kronterm:account-connected"));
                            }}
                        />
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
