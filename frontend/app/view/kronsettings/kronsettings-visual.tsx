// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useAtomValue } from "jotai";
import { memo, useCallback } from "react";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { SectionHeader, SelectSetting, SettingsCard, ToggleSetting } from "./kronsettings-shared";

interface KronSettingsVisualContentProps {
    model: KronSettingsViewModel;
}

const KronSettingsVisualContent = memo(({ model }: KronSettingsVisualContentProps) => {
    const fullConfig = useAtomValue(model.env.atoms.fullConfigAtom);
    const settings = fullConfig?.settings ?? {};

    const setValues = useCallback((values: Record<string, any>) => {
        void RpcApi.SetConfigCommand(TabRpcClient, values).catch((error) => {
            console.warn("[KronOS settings] config update failed", error);
        });
    }, []);

    const reducedMotion = settings["window:reducedmotion"] ?? false;
    const cursorBlink = settings["term:cursorblink"] ?? false;
    const durableSessions = settings["term:durable"] ?? true;
    const showHiddenFiles = settings["preview:showhiddenfiles"] ?? false;
    const confirmTabClose = settings["tab:confirmclose"] ?? false;
    const hideAIButton = settings["app:hideaibutton"] ?? false;
    const focusFollowsCursor = settings["app:focusfollowscursor"] ?? "off";
    const minimalUi = settings["app:minimalui"] ?? false;
    const telemetryEnabled = settings["telemetry:enabled"] ?? false;

    return (
        <div>
            <SettingsCard>
                <SectionHeader title="Theme" icon="palette" description="Customize the appearance of your terminal." />
                <ToggleSetting
                    title="Reduced Motion"
                    description="Reduce animations and transitions."
                    checked={reducedMotion}
                    onChange={(v) => setValues({ "window:reducedmotion": v })}
                />
            </SettingsCard>

            <SettingsCard>
                <SectionHeader title="Terminal" icon="terminal" description="Terminal behavior and display." />
                <ToggleSetting
                    title="Cursor Blink"
                    description="Make the terminal cursor blink."
                    checked={cursorBlink}
                    onChange={(v) => setValues({ "term:cursorblink": v })}
                />
                <ToggleSetting
                    title="Durable Sessions"
                    description="Keep terminal sessions alive across restarts."
                    checked={durableSessions}
                    onChange={(v) => setValues({ "term:durable": v })}
                />
            </SettingsCard>

            <SettingsCard>
                <SectionHeader title="Interface" icon="sliders" description="Interface behavior." />
                <ToggleSetting
                    title="Show Hidden Files"
                    description="Show dotfiles in file previews."
                    checked={showHiddenFiles}
                    onChange={(v) => setValues({ "preview:showhiddenfiles": v })}
                />
                <ToggleSetting
                    title="Confirm Tab Close"
                    description="Show a confirmation dialog when closing a tab."
                    checked={confirmTabClose}
                    onChange={(v) => setValues({ "tab:confirmclose": v })}
                />
                <ToggleSetting
                    title="Hide AI Button"
                    description="Remove the AI button from the interface."
                    checked={hideAIButton}
                    onChange={(v) => setValues({ "app:hideaibutton": v })}
                />
                <ToggleSetting
                    title="Minimal Interface"
                    description="Quiet chrome: fewer borders, flat surfaces, and content-first styling across the workspace."
                    checked={minimalUi}
                    onChange={(v) => setValues({ "app:minimalui": v })}
                />
                <SelectSetting
                    title="Focus Follows Cursor"
                    description="How focus follows the mouse cursor."
                    value={focusFollowsCursor}
                    onChange={(v) => setValues({ "app:focusfollowscursor": v })}
                    options={[
                        { value: "off", label: "Off" },
                        { value: "normal", label: "Normal" },
                        { value: "strict", label: "Strict" },
                    ]}
                />
            </SettingsCard>

            <SettingsCard>
                <SectionHeader title="Privacy" icon="shield-halved" description="Data collection preferences." />
                <ToggleSetting
                    title="Telemetry"
                    description="Send anonymous usage data to help improve KronOS."
                    checked={telemetryEnabled}
                    onChange={(v) => setValues({ "telemetry:enabled": v })}
                />
            </SettingsCard>
        </div>
    );
});

KronSettingsVisualContent.displayName = "KronSettingsVisualContent";

export { KronSettingsVisualContent };
