// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { newIslandFlight, stepIslandFlight } from "./island-flight";
import { islandReplayDuration, readIslandReplay, replayIslandFlight, WestLandingReplay } from "./island-replay";

describe("Island Courier playtest", () => {
    it("delivers at West Landing and replays the same inputs on an edited scene", () => {
        const end = islandReplayDuration(WestLandingReplay);
        const baseline = replayIslandFlight(WestLandingReplay, end, WestLandingReplay.wind);
        const stronger = replayIslandFlight(WestLandingReplay, end, { ...WestLandingReplay.wind, strength: 1.5 });
        expect(baseline.delivered).toBe(2);
        expect(stronger.x).toBeGreaterThan(baseline.x);
        expect(stronger.delivered).toBe(1);
    });

    it("matches tapped inputs and can resume a flight from a scrubbed position", () => {
        const { steps, wind } = WestLandingReplay;
        const flight = newIslandFlight();
        for (const { directions, seconds } of steps) stepIslandFlight(flight, new Set(directions), seconds, wind);
        expect(replayIslandFlight(WestLandingReplay, islandReplayDuration(WestLandingReplay), wind)).toEqual(flight);
        const midflight = replayIslandFlight(WestLandingReplay, steps[0].seconds, wind);
        expect(midflight.delivered).toBe(0);
        stepIslandFlight(midflight, new Set(steps[1].directions), steps[1].seconds, wind);
        expect(midflight.delivered).toBe(1);
    });

    it("restores valid recorded routes and rejects invalid input", () => {
        expect(readIslandReplay(JSON.stringify(WestLandingReplay))).toEqual(WestLandingReplay);
        expect(
            readIslandReplay(JSON.stringify({ ...WestLandingReplay, steps: [{ directions: ["up"], seconds: 1 }] }))
        ).toBeUndefined();
    });
});
