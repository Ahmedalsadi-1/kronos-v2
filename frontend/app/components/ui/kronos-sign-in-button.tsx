// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { SystemCenterOpenEvent } from "@/app/workspace/command-center-events";
import { cn } from "@/util/util";
import type { CSSProperties } from "react";
import { KronOSAccountAvatar } from "./kronos-account-avatar";
import { useKronosAccount } from "./use-kronos-account";

export function KronOSSignInButton({
    className,
    showName = false,
    onOpen,
}: {
    className?: string;
    showName?: boolean;
    onOpen?: () => void;
}) {
    const { status } = useKronosAccount();
    const label = status?.account ? "KronOS account: " + (status.account.email || "Signed in") : "Sign in to KronOS";
    return (
        <button
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            title={label}
            className={cn(
                "inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1",
                className
            )}
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            onClick={
                onOpen ??
                (() => {
                    if (status?.account)
                        window.dispatchEvent(
                            new CustomEvent(SystemCenterOpenEvent, { detail: { center: "control", section: "user" } })
                        );
                    else getApi().openKronosSignIn();
                })
            }
        >
            <KronOSAccountAvatar account={status?.account} />
            {showName && (
                <span className="max-w-40 truncate">
                    {status?.account?.email || (status?.account ? "Account" : "Sign in")}
                </span>
            )}
        </button>
    );
}
