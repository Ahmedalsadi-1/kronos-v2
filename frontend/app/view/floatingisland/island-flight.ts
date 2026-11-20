// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const IslandDepots = [
    { x: 2.7, z: 3.5, name: "South Lookout", label: "A" },
    { x: -3.65, z: 1.3, name: "West Landing", label: "B" },
    { x: 0.1, z: -3.9, name: "North Station", label: "C" },
] as const;

export const IslandLaunch = { x: 1.3, z: 0.4 };
export const FlightBoundary = 6.7;
export const IslandFlightKeys = {
    ArrowUp: "north",
    ArrowDown: "south",
    ArrowLeft: "west",
    ArrowRight: "east",
    KeyW: "north",
    KeyS: "south",
    KeyA: "west",
    KeyD: "east",
} as const;

export type FlightDirection = (typeof IslandFlightKeys)[keyof typeof IslandFlightKeys];
export type IslandWind = { x: number; z: number; strength: number };
export type IslandFlight = { x: number; z: number; heading: number; delivered: number };
export type IslandFlightMode = "ready" | "playing" | "paused" | "complete";

export function newIslandFlight(): IslandFlight {
    return { ...IslandLaunch, heading: 0, delivered: 0 };
}

export function stepIslandFlight(
    flight: IslandFlight,
    directions: ReadonlySet<FlightDirection>,
    seconds: number,
    wind?: IslandWind
) {
    const dx = Number(directions.has("east")) - Number(directions.has("west"));
    const dz = Number(directions.has("south")) - Number(directions.has("north"));
    if ((!dx && !dz) || flight.delivered >= IslandDepots.length) return;
    const speed = (3.5 * seconds) / Math.hypot(dx, dz);
    flight.x += dx * speed;
    flight.z += dz * speed;
    if (wind) {
        const gust = Math.max(0, 1 - Math.hypot(flight.x - wind.x, flight.z - wind.z) / 2.8);
        flight.x += gust * wind.strength * seconds;
    }
    const distance = Math.hypot(flight.x, flight.z);
    if (distance > FlightBoundary) {
        flight.x *= FlightBoundary / distance;
        flight.z *= FlightBoundary / distance;
    }
    flight.heading = Math.atan2(dx, dz);
    const depot = IslandDepots[flight.delivered];
    if (Math.hypot(flight.x - depot.x, flight.z - depot.z) < 0.66) flight.delivered++;
}
