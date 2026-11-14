// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Logo from "@/app/asset/logo.svg?url";
import { getApi } from "@/app/store/global";
import { cn } from "@/util/util";
import type { CSSProperties } from "react";

export function KronOSSignInButton({
    className,
    showName = false,
    onOpen = () => getApi().openKronosSignIn(),
}: {
    className?: string;
    showName?: boolean;
    onOpen?: () => void;
}) {
    return (
        <button
            type="button"
            aria-label="Sign in to KronOS"
            aria-haspopup="dialog"
            title="Sign in to KronOS"
            className={cn(
                "inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1",
                className
            )}
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            onClick={onOpen}
        >
            <img src={Logo} alt="" className="size-5 shrink-0" draggable={false} />
            {showName && <span>KronOS</span>}
        </button>
    );
}
