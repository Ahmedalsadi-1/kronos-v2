// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    newIslandFlight,
    stepIslandFlight,
    type FlightDirection,
    type IslandFlight,
    type IslandWind,
} from "./island-flight";
export type IslandReplayStep = { directions: FlightDirection[]; seconds: number };
export type IslandReplay = { steps: IslandReplayStep[]; wind: IslandWind };

export const DefaultIslandWind: IslandWind = { x: -4.32, z: 2.2, strength: 0.45 };
export const MaxIslandReplaySteps = 3600;

export const WestLandingReplay: IslandReplay = {
    wind: DefaultIslandWind,
    steps: [
        { directions: ["east"], seconds: 0.375 },
        { directions: ["south"], seconds: 0.75 },
        { directions: ["west"], seconds: 1.875 },
        { directions: ["north"], seconds: 0.5 },
    ],
};

export function islandReplayDuration(replay: IslandReplay) {
    return replay.steps.reduce((duration, step) => duration + step.seconds, 0);
}

export function isIslandWind(wind: IslandWind): boolean {
    return (
        !!wind &&
        [wind.x, wind.z, wind.strength].every(Number.isFinite) &&
        Math.abs(wind.x) <= 5 &&
        Math.abs(wind.z) <= 5 &&
        wind.strength >= 0 &&
        wind.strength <= 1.5
    );
}

export function replayIslandFlight(replay: IslandReplay, seconds: number, wind: IslandWind): IslandFlight {
    const flight = newIslandFlight();
    for (const step of replay.steps) {
        if (seconds <= 0) break;
        stepIslandFlight(flight, new Set(step.directions), Math.min(step.seconds, seconds), wind);
        seconds -= step.seconds;
    }
    return flight;
}

export function readIslandReplay(serialized: string): IslandReplay | undefined {
    if (!serialized) return;
    try {
        const replay = JSON.parse(serialized) as IslandReplay;
        const { steps, wind } = replay;
        if (!Array.isArray(steps) || steps.length === 0 || steps.length > MaxIslandReplaySteps || !isIslandWind(wind))
            return;
        if (
            steps.every(
                ({ directions, seconds }) =>
                    Array.isArray(directions) &&
                    directions.length <= 4 &&
                    directions.every((direction) => ["north", "south", "east", "west"].includes(direction)) &&
                    Number.isFinite(seconds) &&
                    seconds > 0 &&
                    seconds <= 2
            )
        )
            return replay;
    } catch {
        return;
    }
}
