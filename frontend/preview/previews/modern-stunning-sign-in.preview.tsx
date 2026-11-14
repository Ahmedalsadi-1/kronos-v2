// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { KronOSSignInButton } from "@/app/components/ui/kronos-sign-in-button";
import { SignIn1 } from "@/app/components/ui/modern-stunning-sign-in";
import { useRef } from "react";

export function Demo() {
    const popup = useRef<HTMLDialogElement>(null);
    return (
        <div className="w-full border-b border-border px-4 py-2">
            <KronOSSignInButton showName onOpen={() => popup.current?.showModal()} />
            <dialog
                ref={popup}
                aria-label="KronOS test sign-in"
                className="fixed m-auto w-[min(464px,calc(100%-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-xl backdrop:bg-black/50 [&_main]:min-h-0"
            >
                <SignIn1 onClose={() => popup.current?.close()} />
            </dialog>
        </div>
    );
}
