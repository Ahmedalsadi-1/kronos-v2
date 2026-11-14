// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { memo } from "react";
import type { KronSettingsViewModel } from "./kronsettings-model";
import { SectionHeader, SettingsCard } from "./kronsettings-shared";

const KronSettingsGitContent = memo((_props: { model: KronSettingsViewModel }) => (
    <SettingsCard>
        <SectionHeader title="Git commit identity" icon="code-branch" />
        <div className="space-y-3 text-sm text-secondary">
            <p>
                    Commits use the Git identity configured where the repository runs. Open a terminal in the
                    repository and run <code>git config user.name "Your Name"</code> and{" "}
                    <code>git config user.email "you@example.com"</code> to set that repository’s identity.
            </p>
        </div>
    </SettingsCard>
));

KronSettingsGitContent.displayName = "KronSettingsGitContent";

export { KronSettingsGitContent };
