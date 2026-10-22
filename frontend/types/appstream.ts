// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type AppStreamInput = {
    app: string;
    action: "click" | "type" | "press" | "scroll" | "drag";
    x?: number;
    y?: number;
    toX?: number;
    toY?: number;
    frameWidth?: number;
    frameHeight?: number;
    button?: "left" | "right" | "middle";
    clickCount?: number;
    text?: string;
    keys?: string;
    direction?: "up" | "down" | "left" | "right";
    pages?: number;
};
