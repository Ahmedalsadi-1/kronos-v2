// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from "vitest";
import { MochiBotEngine } from "./bot-engine";

it("renders the selected pet color even when the idle state has no tint", () => {
    const colors: string[] = [];
    const gradient = { addColorStop: (_offset: number, color: string) => colors.push(color) };
    const context = new Proxy(
        { createLinearGradient: () => gradient },
        {
            get: (target, property) => (property in target ? target[property] : vi.fn()),
        }
    ) as unknown as CanvasRenderingContext2D;
    const engine = new MochiBotEngine();
    engine.bodyColor = [109, 154, 233];
    engine.catEars = true;
    engine.setState("idle", true);
    engine.draw(context, 180, 156);
    expect(colors).toEqual(["rgb(109,154,233)", "rgb(109,154,233)"]);
});
