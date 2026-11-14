// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { memo } from "react";
import { Toggle } from "@/app/element/toggle";
import { SettingsCard, SectionHeader, SettingRow, InfoCallout } from "./kronsettings-shared";
import { useToggleField } from "./kronsettings-hooks";
import type { KronSettingsViewModel } from "./kronsettings-model";

interface KronSettingsSessionsContentProps {
    model: KronSettingsViewModel;
}

const KronSettingsSessionsContent = memo(({ model: _model }: KronSettingsSessionsContentProps) => {
    const [durableSessions, setDurableSessions] = useToggleField("term:durable");

    return (
        <div>
            <SettingsCard>
                <SectionHeader title="Session Retention" icon="clock-rotate-left" description="Choose whether terminal sessions persist across restarts." />
                <SettingRow title="Durable Sessions" description="Keep terminal sessions alive across restarts.">
                    <Toggle checked={durableSessions} onChange={setDurableSessions} />
                </SettingRow>
            </SettingsCard>
            <InfoCallout>
                <i className="fa-solid fa-circle-info" />
                Durable sessions use SSH multiplexing to survive network interruptions and app restarts.
            </InfoCallout>
        </div>
    );
});

KronSettingsSessionsContent.displayName = "KronSettingsSessionsContent";

export { KronSettingsSessionsContent };
