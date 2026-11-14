// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { memo } from "react";
import { SettingsCard, InfoCallout } from "./kronsettings-shared";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { KronSettingsDiagnostics } from "./kronsettings-diagnostics";

interface KronSettingsAboutContentProps {
    model: KronSettingsViewModel;
}

const KronSettingsAboutContent = memo(({ model }: KronSettingsAboutContentProps) => {
    const fullConfig = useAtomValue(model.env.atoms.fullConfigAtom);
    const version = (fullConfig as FullConfigType & { version?: string })?.version ?? "unknown";

    return (
        <div>
            <SettingsCard>
                <div className="kron-settings-about-hero">
                    <i className="fa fa-solid fa-terminal" />
                    <div>
                        <div className="kron-settings-about-name">KronOS</div>
                        <div className="kron-settings-about-tagline">Your workspace. Your models. Your keys.</div>
                    </div>
                </div>

                <div className="kron-settings-about-row">
                    <span className="kron-settings-about-label">Version</span>
                    <span className="kron-settings-about-value">{version}</span>
                </div>
                <div className="kron-settings-about-row">
                    <span className="kron-settings-about-label">Platform</span>
                    <span className="kron-settings-about-value" style={{ fontFamily: "unset" }}>{navigator.platform}</span>
                </div>
            </SettingsCard>

            <SettingsCard>
                <div className="kron-settings-links">
                    <a href="https://ahmedalsadi-1.github.io/kronos-releases/" target="_blank" rel="noopener noreferrer" className="kron-settings-link">
                        <i className="fa fa-solid fa-globe" />
                        Website
                    </a>
                    <a href="https://github.com/Ahmedalsadi-1/kronos-releases/releases" target="_blank" rel="noopener noreferrer" className="kron-settings-link">
                        <i className="fa fa-brands fa-github" />
                        Downloads & release notes
                    </a>
                    <a href="https://ahmedalsadi-1.github.io/kronos-releases/docs/" target="_blank" rel="noopener noreferrer" className="kron-settings-link">
                        <i className="fa fa-solid fa-book" />
                        Docs
                    </a>
                </div>
            </SettingsCard>

            <InfoCallout>
                <i className="fa-solid fa-circle-info" />
                KronOS builds on open-source software. Bundled license and attribution notices remain available with the application.
            </InfoCallout>
            <KronSettingsDiagnostics />
        </div>
    );
});

KronSettingsAboutContent.displayName = "KronSettingsAboutContent";

export { KronSettingsAboutContent };
