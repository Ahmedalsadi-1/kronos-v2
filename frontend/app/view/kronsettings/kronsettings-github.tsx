// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { memo } from "react";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { SectionHeader, SettingsCard } from "./kronsettings-shared";

const KronSettingsGitHubContent = memo((_props: { model: KronSettingsViewModel }) => (
    <SettingsCard>
        <SectionHeader title="GitHub authentication" icon="github" />
        <div className="space-y-3 text-sm text-secondary">
            <p>
                    To use GitHub CLI commands, run <code>gh auth login</code> in the terminal where the workflow
                    runs. Choose the repository explicitly when you work with an organization or a fork.
            </p>
        </div>
    </SettingsCard>
));

KronSettingsGitHubContent.displayName = "KronSettingsGitHubContent";

export { KronSettingsGitHubContent };
