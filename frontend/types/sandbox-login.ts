// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export const SandboxLoginProviders = ["google", "apple", "github"] as const;
export type SandboxLoginProvider = (typeof SandboxLoginProviders)[number];

export type SandboxLoginState = {
    id: string;
    origin: string;
    computerId: string;
    computerName: string;
    phase: "choose" | "submitting" | "review" | "complete" | "cancelled" | "unverified";
    account: string;
    policy: "ask" | "automatic";
    onePasswordAvailable: boolean;
    providers?: SandboxLoginProvider[];
    registration?: boolean;
    signUpAvailable?: boolean;
    passwordVisible?: boolean;
    error?: string;
    memoryNotice?: string;
    reusedSession?: boolean;
};

export type SandboxLoginUiCommand = {
    action: "poll" | "accounts" | "provider" | "signup" | "submit" | "complete" | "cancel";
    sessionIds: string[];
    requestId?: string;
    provider?: "manual" | "1password" | SandboxLoginProvider;
    username?: string;
    password?: string;
    itemId?: string;
    vaultId?: string;
    account?: string;
    remember?: boolean;
    policy?: "ask" | "automatic";
};

export type SandboxLoginUiResult = {
    request?: SandboxLoginState;
    accounts?: { id: string; vaultId: string; title: string }[];
};
