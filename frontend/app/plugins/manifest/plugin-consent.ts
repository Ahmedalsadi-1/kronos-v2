// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Adapted from stablyai/orca src/shared/plugins/plugin-consent-fingerprint.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.). See THIRD_PARTY_NOTICES.md.

import { canonicalizeCapabilitySet } from "./plugin-capabilities";
import type { PluginManifest } from "./plugin-manifest";

type PluginConsentSubject = Pick<PluginManifest, "capabilities" | "main"> & {
    contributes?: Partial<Pick<PluginManifest["contributes"], "skills" | "agents" | "mcpServers">>;
};

/** Skills, agents, and MCP servers run later under user or agent authority, so consent binds to their bytes. */
function hasDeferredExecutionContributions(manifest: PluginConsentSubject): boolean {
    const c = manifest.contributes;
    return (c?.skills?.length ?? 0) > 0 || (c?.agents?.length ?? 0) > 0 || (c?.mcpServers?.length ?? 0) > 0;
}

/**
 * Consent covers declared capabilities and whether the plugin executes code. A widget-only update that adds `main`
 * crosses a trust boundary even when its capability list is unchanged.
 */
function canonicalizePluginConsent(manifest: PluginConsentSubject, contentIdentity?: string): string {
    const capabilities = canonicalizeCapabilitySet(manifest.capabilities);
    const service = manifest.main == null ? "" : "\0service";
    const deferred = hasDeferredExecutionContributions(manifest)
        ? `\0deferred-content:${contentIdentity ?? "unresolved"}`
        : "";
    return `${capabilities}${service}${deferred}`;
}

export { canonicalizePluginConsent, hasDeferredExecutionContributions, type PluginConsentSubject };
