// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { memo } from "react";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { SectionHeader, SettingsCard } from "./kronsettings-shared";

const KronSettingsDesktopContent = memo((_props: { model: KronSettingsViewModel }) => (
    <SettingsCard>
        <SectionHeader title="Desktop permissions" icon="shield-halved" />
        <div className="space-y-3 text-sm text-secondary">
            <p>
                    For local apps on macOS, use System Settings &gt; Privacy &amp; Security. Accessibility allows input
                    and Screen & System Audio Recording allows screen capture.
            </p>
            <p>
                    In the Computers widget, use Take control to pause the agent on a device. Use Resume Kronos
                    when you want to hand control back.
            </p>
        </div>
    </SettingsCard>
));

KronSettingsDesktopContent.displayName = "KronSettingsDesktopContent";

export { KronSettingsDesktopContent };
