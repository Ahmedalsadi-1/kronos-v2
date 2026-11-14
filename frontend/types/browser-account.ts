// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SandboxLoginProvider } from "./sandbox-login";

export type BrowserAccountState = {
    origin: string;
    status: "required" | "authenticated" | "unknown";
    registration: boolean;
    signUpAvailable: boolean;
    providers: SandboxLoginProvider[];
    canRemember: boolean;
    rememberedAccount?: string;
};

export type BrowserAccountCommand = { guestId: number } & (
    | { action: "inspect" }
    | { action: "provider"; page: string; provider: SandboxLoginProvider }
    | { action: "signup"; page: string }
    | { action: "remember"; origin: string; account: string }
);
