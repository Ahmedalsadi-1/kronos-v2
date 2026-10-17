// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type HudActionContext = {
    isKnownBlock: (blockId: string) => boolean;
    isDetached: (blockId: string) => boolean;
    setMode: (mode: "hud" | "alongside" | "workspace") => void;
    setBackground: (blockId: string, background: boolean) => void | Promise<void>;
    showWorkspaceBlock: (blockId: string) => void | Promise<void>;
    showDetachedBlock: (blockId: string) => Promise<boolean>;
    hideDetachedBlock: (blockId: string) => Promise<boolean>;
};

export async function handleKronTermHudSurfaceAction(
    input: { action: string; blockid?: string; presentation?: string },
    context: HudActionContext
): Promise<{ success: boolean; message: string } | undefined> {
    if (!["hud.mode", "hud.open", "hud.background", "hud.restore"].includes(input.action)) return;
    if (input.action === "hud.mode") {
        if (!["hud", "alongside", "workspace"].includes(input.presentation)) {
            throw new Error("HUD mode must be hud, alongside, or workspace.");
        }
        context.setMode(input.presentation as "hud" | "alongside" | "workspace");
        return { success: true, message: `HUD mode changed to ${input.presentation}.` };
    }
    const blockId = input.blockid?.trim();
    if (!blockId || !context.isKnownBlock(blockId)) {
        throw new Error("Widget not found in the current workspace or its HUD islands.");
    }
    const background = input.action === "hud.background";
    if (!background) context.setMode("hud");
    if (context.isDetached(blockId)) {
        const opened = background ? await context.hideDetachedBlock(blockId) : await context.showDetachedBlock(blockId);
        if (!opened) throw new Error("The widget's native HUD island is unavailable.");
    } else if (!background) {
        await context.setBackground(blockId, false);
        await context.showWorkspaceBlock(blockId);
    }
    await context.setBackground(blockId, background);
    return {
        success: true,
        message: background ? "Widget continues running in the background." : "Expanded the existing live widget.",
    };
}
