// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { $gateway } from "@hermes/store/gateway";
import { $activeGatewayProfile, normalizeProfileKey } from "@hermes/store/profile";

export async function reloadInstalledSkills(profile?: string | null): Promise<void> {
    const target = normalizeProfileKey(profile ?? $activeGatewayProfile.get());
    if (target !== normalizeProfileKey($activeGatewayProfile.get())) {
        throw new Error("Switch to that profile and refresh Skills to reload its catalog.");
    }
    const gateway = $gateway.get();
    if (!gateway)
        throw new Error("The agent is disconnected. Reconnect and refresh Skills.");
    await gateway.request("skills.reload", {});
}
