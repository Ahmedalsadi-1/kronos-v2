// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Logo from "@/app/asset/logo.svg?url";
import type { KronOSAccountProfile } from "@/types/kronos-account";
import { cn } from "@/util/util";

export function KronOSAccountAvatar({ account, className }: { account?: KronOSAccountProfile; className?: string }) {
    return (
        <img
            src={account?.avatarURL || Logo}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            className={cn("size-6 shrink-0 rounded-full object-cover", className)}
            onError={(event) => {
                if (event.currentTarget.getAttribute("src") !== Logo) event.currentTarget.src = Logo;
            }}
        />
    );
}
