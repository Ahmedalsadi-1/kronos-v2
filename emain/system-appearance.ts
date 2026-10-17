// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type SystemAppearanceInputs = {
    dark: boolean;
    highContrast: boolean;
    reducedMotion: boolean;
    reducedTransparency: boolean;
};

function makeSystemAppearanceSnapshot(inputs: SystemAppearanceInputs): SystemAppearanceSnapshot {
    return {
        colorScheme: inputs.dark ? "dark" : "light",
        contrast: inputs.highContrast ? "high" : "normal",
        reducedTransparency: inputs.reducedTransparency,
        reducedMotion: inputs.reducedMotion,
    };
}

export { makeSystemAppearanceSnapshot, type SystemAppearanceInputs };
