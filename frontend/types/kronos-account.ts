// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type AccountCommand =
    | { action: "status" | "cancel" | "sign-out" }
    | { action: "provider"; provider: "google" | "github" }
    | { action: "send-code"; email: string }
    | { action: "verify-code"; code: string };

export type KronOSAccountProfile = { email: string; name?: string; avatarURL?: string };
export type AccountStatus = { configured: boolean; account: KronOSAccountProfile | null };
