// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const AppStreamFrameSizeEvent = "kronterm:appstream-frame-size";

export type AppStreamFrameSize = {
    blockId: string;
    width: number;
    height: number;
};
