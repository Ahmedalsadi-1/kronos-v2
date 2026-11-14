// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const RetiredChatViews = new Set(["chathubv2", "kronoschat", "kronoschamber"]);

export function resolveBlockView(view: string): string {
    if (view === "medialibrary") return "preview";
    return RetiredChatViews.has(view) ? "hermes" : view;
}
