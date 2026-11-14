// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { memo } from "react";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { SectionHeader, SettingsCard } from "./kronsettings-shared";

const KronSettingsNotificationsContent = memo((_props: { model: KronSettingsViewModel }) => (
    <SettingsCard>
        <SectionHeader title="Agent notifications" icon="comment" />
        <div className="space-y-3 text-sm text-secondary">
            <p>
                    Open KronOS Agent and go to Settings &gt; Notifications to choose which agent events send
                    desktop notifications, preview the completion sound, or send a test notification.
            </p>
            <p>
                    To manage delivery for KronOS itself, use your operating system’s notification settings.
            </p>
        </div>
    </SettingsCard>
));

KronSettingsNotificationsContent.displayName = "KronSettingsNotificationsContent";

export { KronSettingsNotificationsContent };
