// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { botSessionId, focusBotConversation } from "@/app/view/hermes/openmausbot-hermes-backend";
import { getApi } from "@/store/global";
import type { AgentBot } from "@/types/agent-bot";
import { atom } from "jotai";
import { useEffect, useId, useRef, useState } from "react";

export class BotsModel implements ViewModel {
    viewType = "bots";
    viewName = atom("Bots");
    viewIcon = atom("robot");
    noPadding = atom(true);
    viewComponent = BotsWidget;
    constructor(_opts: ViewModelInitType) {}
}
export function BotsWidget({ withinHermes = false }: { withinHermes?: boolean }) {
    const [bots, setBots] = useState<AgentBot[]>([]);
    const [showConversations, setShowConversations] = useState(true);
    const frame = useRef<HTMLIFrameElement>(null);
    const [connection, setConnection] = useState<{ origin: string; parentOrigin: string }>();
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [openingDesktop, setOpeningDesktop] = useState("");
    const pending = useRef(false);
    const mounted = useRef(false);
    const conversationsId = useId();
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const openConversation = (botId: string, threadId: string, presentation: "panel" | "hud") => {
        const id = botSessionId(botId, threadId);
        focusBotConversation(id);
        if (withinHermes) {
            hermesSurfaceController.setSession(id);
            return;
        }
        if (presentation === "hud") hermesSurfaceController.requestOpenHud(id);
        else hermesSurfaceController.requestOpenPanel(id);
    };
    const openDesktop = async (botId: string) => {
        if (pending.current) return;
        pending.current = true;
        setOpeningDesktop(botId);
        setError("");
        try {
            const desktop = await getApi().openBotDesktop(botId);
            if (!mounted.current) return;
            await getApi().switchWorkspace(desktop.workspaceId);
        } catch (reason) {
            if (mounted.current) setError(String(reason));
        } finally {
            pending.current = false;
            if (mounted.current) setOpeningDesktop("");
        }
    };
    useEffect(() => {
        let active = true;
        if (withinHermes) {
            getApi()
                .agentBotCommand({ action: "list" })
                .then((roster) => {
                    if (active) setBots(roster.bots ?? []);
                })
                .catch((reason) => {
                    if (active) setError(String(reason));
                });
            return () => {
                active = false;
            };
        }
        getApi()
            .openAgentWorkspace()
            .then((result) => {
                if (active) setConnection(result);
                return getApi()
                    .agentBotCommand?.({ action: "list" })
                    .then((roster) => {
                        if (active) setBots(roster.bots ?? []);
                    });
            })
            .catch((reason) => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
        };
    }, [attempt, withinHermes]);
    useEffect(() => {
        if (!connection) return;
        const receive = (event: MessageEvent) => {
            if (
                event.origin !== connection.origin ||
                event.source !== frame.current?.contentWindow ||
                event.data?.source !== "kronterm-openmausbot"
            )
                return;
            const { type, botId } = event.data;
            if (
                type !== "open-desktop" ||
                typeof botId !== "string" ||
                !/^[a-zA-Z0-9_-]{1,128}$/.test(botId) ||
                pending.current
            )
                return;
            void openDesktop(botId);
        };
        window.addEventListener("message", receive);
        return () => {
            window.removeEventListener("message", receive);
        };
    }, [connection]);
    const url = connection ? new URL("/kronterm-app", connection.origin) : null;
    url?.searchParams.set("parentOrigin", connection.parentOrigin);
    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-accent">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-sm">
                <span className="mr-auto font-medium">{withinHermes ? "Bots in Hermes" : "Bots and settings"}</span>
                <button
                    aria-pressed={showConversations}
                    aria-controls={conversationsId}
                    className="cursor-pointer px-3 py-2"
                    onClick={() => {
                        setShowConversations((value) => !value);
                        void getApi()
                            .agentBotCommand?.({ action: "list" })
                            .then((roster) => setBots(roster.bots ?? []))
                            .catch((reason) => setError(String(reason)));
                    }}
                >
                    Conversations
                </button>
                {!withinHermes && (
                    <button
                        className="cursor-pointer rounded border border-border px-3 py-2"
                        onClick={() => hermesSurfaceController.requestOpenPanel()}
                    >
                        Kronos chat
                    </button>
                )}
            </div>
            {error && (
                <div role="alert" className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    {error}
                    <button
                        className="cursor-pointer border border-border px-3 py-2"
                        onClick={() => {
                            setError("");
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}
            {!withinHermes && !url && !error && (
                <div role="status" className="p-3 text-sm">
                    Starting Bots…
                </div>
            )}
            {showConversations && (connection || withinHermes) && (
                <div
                    id={conversationsId}
                    className="max-h-64 overflow-auto border-b border-border p-3"
                    aria-label="Bot conversations"
                >
                    <p className="mb-3 text-sm text-muted">
                        {withinHermes
                            ? "Select a conversation to continue it in this Hermes chat."
                            : "Continue the same conversation in chat or HUD, or open the bot’s desktop."}
                    </p>
                    {bots.length === 0 && (
                        <p className="text-sm">
                            {withinHermes
                                ? "No bot conversations are available yet."
                                : "No bot conversations yet. Create a bot in settings below."}
                        </p>
                    )}
                    {bots.map((bot) => (
                        <div key={bot.id} className="mb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="text-sm">{bot.name}</strong>
                                <button
                                    className="cursor-pointer border border-border px-3 py-2 text-xs"
                                    disabled={!!openingDesktop}
                                    onClick={() => void openDesktop(bot.id)}
                                >
                                    {openingDesktop === bot.id ? "Opening desktop…" : "Open desktop"}
                                </button>
                            </div>
                            {(bot.tasks.length ? bot.tasks : [{ threadId: bot.threadId, title: bot.name }])
                                .filter((task) => task.threadId)
                                .map((task) => (
                                    <div key={task.threadId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                                        <span className="mr-auto min-w-0 basis-full truncate sm:basis-auto">
                                            {task.title}
                                            {task.busy ? " · Working" : ""}
                                        </span>
                                        <button
                                            className="cursor-pointer border border-border px-3 py-2 text-xs"
                                            onClick={() => openConversation(bot.id, task.threadId, "panel")}
                                        >
                                            {withinHermes ? "Chat in Hermes" : "Open chat"}
                                        </button>
                                        {!withinHermes && (
                                            <button
                                                className="cursor-pointer border border-border px-3 py-2 text-xs"
                                                onClick={() => openConversation(bot.id, task.threadId, "hud")}
                                            >
                                                HUD
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
            )}
            {url && (
                <iframe
                    ref={frame}
                    title="Bot settings and workspaces"
                    src={url.href}
                    className="min-h-0 w-full flex-1 border-0"
                />
            )}
        </div>
    );
}
