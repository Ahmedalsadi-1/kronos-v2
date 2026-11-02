// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { HermesSurfaceContext } from "./hermes-runtime";

const Bindings = new Map<string, string>();
export function sandboxComputerForTab(tabId?: string): string | undefined {
    return tabId ? Bindings.get(tabId) : undefined;
}
export function bindSandboxComputer(tabId: string, desktopId?: string) {
    if (!tabId) throw new Error("A workspace tab is required for Computer mode.");
    if (desktopId) Bindings.set(tabId, desktopId);
    else Bindings.delete(tabId);
}
export function withSandboxComputerScope(context: HermesSurfaceContext): HermesSurfaceContext {
    if (!context) return context;
    const sandboxComputerId = sandboxComputerForTab(context.tabId);
    return sandboxComputerId ? { ...context, sandboxComputerId } : context;
}

const ChatOwners = new Map<string, { tabId: string; workspaceId?: string }>();
export function registerComputerChats(tabId: string, sessionIds: string[], workspaceId?: string) {
    if (
        !Array.isArray(sessionIds) ||
        sessionIds.length > 4 ||
        sessionIds.some((id) => typeof id !== "string" || !id || id.length > 256)
    )
        throw new Error("Invalid chat identity.");
    for (const id of sessionIds) {
        const previous = ChatOwners.get(id);
        if (previous && previous.tabId !== tabId && Bindings.has(previous.tabId))
            throw new Error(
                "This chat has Computer mode in another workspace. Disable it there before moving the grant."
            );
        ChatOwners.set(id, { tabId, workspaceId });
    }
    while (ChatOwners.size > 4096) ChatOwners.delete(ChatOwners.keys().next().value);
}
export function hasSandboxComputerGrants(): boolean {
    return Bindings.size > 0;
}
export function resolveComputerChatContext(
    context: HermesSurfaceContext,
    sessionId?: string,
    taskId?: string
): HermesSurfaceContext {
    if (context?.agentRuntime !== "hermes") return context;
    const sessionOwner = typeof sessionId === "string" ? ChatOwners.get(sessionId) : undefined;
    const taskOwner = typeof taskId === "string" ? ChatOwners.get(taskId) : undefined;
    if (sessionOwner && taskOwner && sessionOwner.tabId !== taskOwner.tabId)
        throw new Error("Runtime chat identities resolve to different workspaces.");
    const owner = sessionOwner || taskOwner;
    if (!owner) {
        if (hasSandboxComputerGrants())
            throw new Error(
                "This chat has no registered Computer scope. Open its chat in KronTerm before issuing tools."
            );
        return context;
    }
    const { sandboxComputerId: _oldComputer, ...caller } = context;
    return withSandboxComputerScope({ ...caller, ...owner, toolSessionId: sessionId });
}
