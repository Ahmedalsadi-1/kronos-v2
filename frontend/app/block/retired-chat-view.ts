// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const RetiredChatViews = new Set(["chathubv2", "kronoschat", "kronoschamber"]);

export function resolveBlockView(view: string): string {
    return RetiredChatViews.has(view) ? "hermes" : view;
}
