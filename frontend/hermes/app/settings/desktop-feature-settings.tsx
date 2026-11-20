// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0
import { PawPrint, Zap } from "@hermes/lib/icons";
import { canUseQuickEntry } from "@hermes/store/quick-entry";
import { PetSettings } from "./pet-settings";
import { SettingsContent, SettingsSection } from "./primitives";
import { QuickEntrySettings } from "./quick-entry-settings";

export function QuickEntrySettingsPage() {
    return (
        <SettingsContent>
            <SettingsSection title="Quick entry" icon={Zap}>
                {canUseQuickEntry() ? (
                    <QuickEntrySettings />
                ) : (
                    <p className="py-4 text-sm text-muted-foreground">
                        Quick entry is available in the KronOS desktop app.
                    </p>
                )}
            </SettingsSection>
        </SettingsContent>
    );
}

export function CompanionSettingsPage() {
    return (
        <SettingsContent>
            <SettingsSection title="Desktop companion" icon={PawPrint}>
                <PetSettings />
            </SettingsSection>
        </SettingsContent>
    );
}
