// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import {
    canonicalizePluginConsent,
    type PluginConsentSubject,
} from "../../frontend/app/plugins/manifest/plugin-consent";

function fingerprintPluginConsent(manifest: PluginConsentSubject, contentIdentity?: string): string {
    const digest = createHash("sha256").update(canonicalizePluginConsent(manifest, contentIdentity)).digest("base64");
    return `sha256-${digest}`;
}

export { fingerprintPluginConsent };
