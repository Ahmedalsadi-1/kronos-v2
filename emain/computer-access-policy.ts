// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { isSwarmScoped } from "./swarm-target-scope";

const Bindings = new Map<string, string>();
const Modes = new Map<string, "sandbox" | "hybrid">();
type ChatComputer = { tabId: string; desktopId: string; mode: "sandbox" | "hybrid" };
const ChatComputers = new Map<string, ChatComputer>();
type SavedControl = { owner: "user" | "agent"; agentId?: string; generation: number };
const Controls = new Map<string, SavedControl>();
const InteractionHolds = new Map<string, number>();
export function holdComputerInteraction(desktopId: string, until = 0) {
    if (until > Date.now()) InteractionHolds.set(desktopId, until);
    else InteractionHolds.delete(desktopId);
}
export function hasComputerInteraction(desktopId: string): boolean {
    return (InteractionHolds.get(desktopId) || 0) > Date.now();
}
let storageFile: string;

function persistComputerAccess() {
    if (!storageFile) return;
    mkdirSync(dirname(storageFile), { recursive: true, mode: 0o700 });
    const value = {
        version: 1,
        bindings: [...Bindings].map(([tabId, desktopId]) => ({
            tabId,
            desktopId,
            mode: Modes.get(tabId) || "sandbox",
        })),
        chats: [...ChatOwners].map(([sessionId, owner]) => ({ sessionId, ...owner })),
        chatComputers: [...ChatComputers].map(([chatId, computer]) => ({ chatId, ...computer })),
        controls: [...Controls].map(([desktopId, control]) => ({ desktopId, ...control })),
    };
    writeFileSync(`${storageFile}.tmp`, JSON.stringify(value), { mode: 0o600 });
    renameSync(`${storageFile}.tmp`, storageFile);
}

export function initializeComputerAccessPersistence(file?: string) {
    storageFile = file;
    Bindings.clear();
    Modes.clear();
    ChatOwners.clear();
    ChatComputers.clear();
    Controls.clear();
    InteractionHolds.clear();
    if (!file || !existsSync(file)) return;
    try {
        const saved = JSON.parse(readFileSync(file, "utf8"));
        if (
            saved.version !== 1 ||
            !Array.isArray(saved.bindings) ||
            !Array.isArray(saved.chats) ||
            !Array.isArray(saved.controls) ||
            saved.bindings.length > 4096 ||
            saved.chats.length > 4096 ||
            (saved.chatComputers != null &&
                (!Array.isArray(saved.chatComputers) || saved.chatComputers.length > 128)) ||
            saved.controls.length > 128
        )
            throw new Error("Invalid saved Computer mode state.");
        for (const entry of saved.bindings) {
            if (
                typeof entry.tabId !== "string" ||
                !entry.tabId ||
                typeof entry.desktopId !== "string" ||
                !/^(linux-vm|linux-container):[a-zA-Z0-9-]+$/.test(entry.desktopId) ||
                !["sandbox", "hybrid"].includes(entry.mode)
            )
                throw new Error("Invalid saved computer selection.");
            Bindings.set(entry.tabId, entry.desktopId);
            Modes.set(entry.tabId, entry.mode);
        }
        for (const entry of saved.chats) {
            if (
                typeof entry.sessionId !== "string" ||
                !entry.sessionId ||
                entry.sessionId.length > 256 ||
                typeof entry.tabId !== "string" ||
                !entry.tabId ||
                (entry.workspaceId != null && typeof entry.workspaceId !== "string")
            )
                throw new Error("Invalid saved computer chat.");
            if (
                entry.chatId != null &&
                (typeof entry.chatId !== "string" || !entry.chatId || entry.chatId.length > 256)
            )
                throw new Error("Invalid saved chat alias.");
            ChatOwners.set(entry.sessionId, {
                tabId: entry.tabId,
                workspaceId: entry.workspaceId,
                chatId: entry.chatId,
            });
        }
        for (const { chatId, tabId, desktopId, mode } of saved.chatComputers ?? []) {
            if (
                typeof chatId !== "string" ||
                ChatOwners.get(chatId)?.tabId !== tabId ||
                !tabId ||
                typeof desktopId !== "string" ||
                !/^(linux-vm|linux-container):[a-zA-Z0-9-]+$/.test(desktopId) ||
                !["sandbox", "hybrid"].includes(mode)
            )
                throw new Error("Invalid saved chat computer selection.");
            ChatComputers.set(chatId, { tabId, desktopId, mode });
        }
        for (const entry of saved.controls) {
            if (
                typeof entry.desktopId !== "string" ||
                !["user", "agent"].includes(entry.owner) ||
                !Number.isSafeInteger(entry.generation) ||
                entry.generation < 0 ||
                (entry.agentId != null && typeof entry.agentId !== "string")
            )
                throw new Error("Invalid saved computer owner.");
            Controls.set(entry.desktopId, { owner: entry.owner, agentId: entry.agentId, generation: entry.generation });
        }
    } catch {
        Bindings.clear();
        Modes.clear();
        ChatOwners.clear();
        ChatComputers.clear();
        Controls.clear();
        console.warn("Computer mode state could not be restored; select a computer again to grant access.");
    }
}

export function restoredComputerControl(desktopId: string): SavedControl | undefined {
    const control = Controls.get(desktopId);
    if (!control) return;
    if (!hasWorkspaceComputerAssignment(desktopId, control.agentId))
        return { owner: "user", generation: control.generation + 1 };
    return { ...control, generation: control.generation + 1 };
}

export function rememberComputerControl(desktopId: string, control: SavedControl) {
    if (!storageFile) return;
    Controls.set(desktopId, control);
    persistComputerAccess();
}
export function sandboxChatComputer(tabId: string, sessionId?: string): ChatComputer | undefined {
    if (!sessionId) return;
    const owner = ChatOwners.get(sessionId);
    const computer = ChatComputers.get(owner?.chatId || sessionId);
    if (owner?.tabId === tabId && computer?.tabId === tabId) return computer;
}

export function sandboxComputerModeForTab(tabId?: string, sessionId?: string): "sandbox" | "hybrid" {
    return sandboxChatComputer(tabId, sessionId)?.mode || Modes.get(tabId) || "sandbox";
}
export function sandboxComputerForTab(tabId?: string, sessionId?: string): string | undefined {
    return sandboxChatComputer(tabId, sessionId)?.desktopId || Bindings.get(tabId);
}

export function hasSeparateChatComputer(desktopId: string, tabId?: string, sessionId?: string): boolean {
    const own = sandboxChatComputer(tabId, sessionId);
    return [...ChatComputers.values()].some((computer) => computer.desktopId === desktopId && computer !== own);
}

export function hasSandboxComputerForTab(tabId: string): boolean {
    return Bindings.has(tabId) || [...ChatComputers.values()].some((computer) => computer.tabId === tabId);
}

export function bindSandboxChatComputer(
    tabId: string,
    sessionId: string,
    desktopId?: string,
    mode: "sandbox" | "hybrid" = "sandbox"
) {
    const chatId = sandboxChatSelection(tabId, sessionId);
    if (desktopId) ChatComputers.set(chatId, { tabId, desktopId, mode });
    else ChatComputers.delete(chatId);
    persistComputerAccess();
}

export function sandboxChatSelection(tabId: string, sessionId: string) {
    const owner = ChatOwners.get(sessionId);
    const chatId = owner?.chatId || sessionId;
    if (owner?.tabId !== tabId || ChatOwners.get(chatId)?.tabId !== tabId)
        throw new Error("Open this chat in its owning workspace before assigning a separate sandbox.");
    if (!ChatComputers.has(chatId) && ChatComputers.size >= 128)
        throw new Error("Remove an existing separate sandbox grant first.");
    return chatId;
}
export function bindSandboxComputer(tabId: string, desktopId?: string, mode: "sandbox" | "hybrid" = "sandbox") {
    if (!tabId) throw new Error("A workspace tab is required for Computer mode.");
    if (desktopId) {
        Bindings.set(tabId, desktopId);
        Modes.set(tabId, mode);
    } else {
        Bindings.delete(tabId);
        Modes.delete(tabId);
    }
    persistComputerAccess();
}
export function withSandboxComputerScope(context: HermesSurfaceContext): HermesSurfaceContext {
    if (!context || isSwarmScoped(context)) return context;
    const sessionId = context.chatId || context.toolSessionId;
    const sandboxComputerId = sandboxComputerForTab(context.tabId, sessionId);
    if (context.n8nWorkerId && context.sandboxComputerGeneration != null) {
        if (sandboxComputerId !== context.sandboxComputerId)
            throw new Error("The workflow VM grant changed. Reconnect the VM before running this task again.");
        return context;
    }
    return sandboxComputerId
        ? { ...context, sandboxComputerId, sandboxComputerMode: sandboxComputerModeForTab(context.tabId, sessionId) }
        : context;
}

const ChatOwners = new Map<string, { tabId: string; workspaceId?: string; chatId?: string }>();
export function sameComputerChat(first: string, second: string): boolean {
    return Boolean(
        first && second && (ChatOwners.get(first)?.chatId || first) === (ChatOwners.get(second)?.chatId || second)
    );
}
export function computerTabForChats(sessionIds: string[] = [], fallbackTabId: string): string {
    if (
        !Array.isArray(sessionIds) ||
        sessionIds.length > 4 ||
        sessionIds.some((id) => typeof id !== "string" || !id || id.length > 256)
    )
        throw new Error("Invalid chat identity.");
    const owners = sessionIds
        .map((id) => ChatOwners.get(id)?.tabId)
        .filter((tabId) => tabId && hasSandboxComputerForTab(tabId));
    if (new Set(owners).size > 1) throw new Error("This chat's identities belong to different computer workspaces.");
    return owners[0] || fallbackTabId;
}
export function hasWorkspaceComputerAssignment(desktopId: string, agentId?: string): boolean {
    if (!agentId?.startsWith("sandbox:")) return false;
    const tabId = agentId.slice("sandbox:".length);
    return (
        Bindings.get(tabId) === desktopId ||
        [...ChatComputers.values()].some((computer) => computer.tabId === tabId && computer.desktopId === desktopId)
    );
}
export function registerComputerChats(
    tabId: string,
    sessionIds: string[],
    workspaceId?: string,
    explicitSelection = false
) {
    if (
        !Array.isArray(sessionIds) ||
        sessionIds.length > 4 ||
        sessionIds.some((id) => typeof id !== "string" || !id || id.length > 256)
    )
        throw new Error("Invalid chat identity.");
    const canonicalId = sessionIds.at(-1);
    const separate = sessionIds.map((id) => sandboxChatComputer(ChatOwners.get(id)?.tabId, id));
    if (
        separate.some((computer) => computer && computer.tabId !== tabId) ||
        new Set(separate.filter(Boolean)).size > 1 ||
        (separate.some(Boolean) &&
            sessionIds.length > 1 &&
            (!separate.at(-1) ||
                sessionIds.some((id) => {
                    const existing = ChatOwners.get(id)?.chatId;
                    return existing && existing !== id && existing !== canonicalId;
                })))
    )
        throw new Error("These chat identities conflict with a separate sandbox grant.");
    for (const id of sessionIds) {
        const previous = ChatOwners.get(id);
        if (previous && previous.tabId !== tabId) {
            if (!explicitSelection) continue;
            if (Bindings.get(previous.tabId) && Bindings.get(previous.tabId) === Bindings.get(tabId)) {
                Bindings.delete(previous.tabId);
                Modes.delete(previous.tabId);
            }
        }
        const chatId = sessionIds.length > 1 ? canonicalId : previous?.chatId || id;
        ChatOwners.set(id, {
            tabId,
            workspaceId: workspaceId ?? (previous?.tabId === tabId ? previous.workspaceId : undefined),
            chatId,
        });
    }
    for (const id of ChatOwners.keys()) {
        if (ChatOwners.size <= 4096) break;
        if (!ChatComputers.has(id)) ChatOwners.delete(id);
    }
    persistComputerAccess();
}
export function hasSandboxComputerGrants(): boolean {
    return Bindings.size > 0 || ChatComputers.size > 0;
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
    if (
        sessionOwner &&
        taskOwner &&
        sessionOwner.chatId !== taskOwner.chatId &&
        (sandboxChatComputer(sessionOwner.tabId, sessionId) || sandboxChatComputer(taskOwner.tabId, taskId))
    )
        throw new Error("Runtime chat identities resolve to different sandbox grants.");
    const owner = sessionOwner || taskOwner;
    if (!owner) {
        if (hasSandboxComputerGrants())
            throw new Error(
                "This chat has no registered Computer scope. Open its chat in KronOS before issuing tools."
            );
        return context;
    }
    if (context.n8nWorkerId && context.sandboxComputerGeneration != null) {
        if (owner.tabId !== context.tabId) throw new Error("The workflow VM scope changed.");
        return withSandboxComputerScope({ ...context, toolSessionId: sessionId });
    }
    const { sandboxComputerId: _oldComputer, sandboxComputerMode: _oldMode, ...caller } = context;
    return withSandboxComputerScope({ ...caller, ...owner, toolSessionId: sessionId });
}
