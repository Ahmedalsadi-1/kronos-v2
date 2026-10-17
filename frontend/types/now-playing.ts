// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type MediaCommand = "toggle" | "previous" | "next";
export type NowPlayingState = {
    id: string;
    source: string;
    title: string;
    artist: string;
    playing: boolean;
    muted?: boolean;
    canSkip: boolean;
};
