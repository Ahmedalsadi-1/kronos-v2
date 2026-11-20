// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { Orb, type CircleThemeConfig, type OrbState } from "orb-ui";

const VoiceOrbTheme: CircleThemeConfig = {
    name: "circle",
    preset: "expressive",
    appearance: {
        colors: {
            idle: "#686868",
            connecting: "#747474",
            listening: "#777777",
            thinking: "#646464",
            speaking: "#b9b9b9",
            error: "#525252",
        },
        listeningGlow: 12,
        speakingGlow: 22,
    },
    geometry: {
        diameterRatio: 0.8,
        listeningMinScale: 0.92,
        listeningMaxScale: 1.1,
        speakingMinScale: 0.96,
        speakingMaxScale: 1.16,
    },
    motion: { responseExponent: 0.64, activityRiseMs: 45, activityFallMs: 130 },
};

export function PenVoiceOrb({
    state,
    inputVolume = 0,
    outputVolume = 0,
}: {
    state: OrbState;
    inputVolume?: number;
    outputVolume?: number;
}) {
    return (
        <Orb
            aria-hidden="true"
            size={112}
            style={{ width: "100%", height: "100%", "--orb-ui-size": "100%" }}
            theme={VoiceOrbTheme}
            signal={{ state, inputVolume, outputVolume }}
            interactive={false}
        />
    );
}
