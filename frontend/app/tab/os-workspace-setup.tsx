// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { Code2, Compass, FolderOpen, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OSChannelSetupDraft } from "./os-channel-setup";

export const OSSpaceIdentities = [
    {
        id: "explore",
        name: "Explore",
        icon: Compass,
        color: "#467b88",
        background: "linear-gradient(145deg, #bddbd9, #53808f 55%, #233f57)",
    },
    {
        id: "build",
        name: "Build",
        icon: Code2,
        color: "#636aa2",
        background: "linear-gradient(150deg, #d9d7ec, #8389b3 55%, #3c466b)",
    },
    {
        id: "write",
        name: "Write",
        icon: PenLine,
        color: "#a36d56",
        background: "linear-gradient(145deg, #f0dbc8, #c09385 55%, #795d77)",
    },
    {
        id: "organize",
        name: "Organize",
        icon: FolderOpen,
        color: "#658369",
        background: "linear-gradient(145deg, #dce4ce, #93ac91 55%, #476a66)",
    },
] as const;

export function OSWorkspaceSetup({
    onClose,
    onCreate,
    initialName = "",
    initialIdentity = "build",
    initialChannel,
    editing = false,
}: {
    onClose: () => void;
    onCreate: (
        name: string,
        identity: (typeof OSSpaceIdentities)[number],
        channel?: OSChannelSetupDraft
    ) => Promise<void>;
    initialName?: string;
    initialIdentity?: string;
    initialChannel?: OSChannelSetupDraft;
    editing?: boolean;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const pending = useRef(false);
    const created = useRef<{ id: string; name: string }>(undefined);
    const [connection, setConnection] = useState<{ origin: string; parentOrigin: string }>();
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const identity = OSSpaceIdentities.find((item) => item.id === initialIdentity) ?? OSSpaceIdentities[1];
    const saveGroup = useCallback(
        async (group: { id: string; name: string }) => {
            if (pending.current) return;
            pending.current = true;
            setError("");
            try {
                await onCreate(group.name || initialName || "Agents", identity, {
                    version: 1,
                    status: "active",
                    engine: "kronoscode",
                    companion: "coucou",
                    upstreamGroupId: group.id,
                    bots: [],
                });
            } catch {
                setError("The channel was saved, but its workspace could not be updated. Retry to finish linking it.");
                pending.current = false;
            }
        },
        [onCreate, initialName, identity]
    );
    useEffect(() => {
        const opener = document.activeElement;
        dialogRef.current?.showModal();
        return () => {
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, []);
    useEffect(() => {
        let cancelled = false;
        setError("");
        void getApi()
            .openAgentWorkspace()
            .then(
                (result) => {
                    if (!cancelled) setConnection(result);
                },
                (error) => {
                    if (!cancelled)
                        setError(error instanceof Error ? error.message : "Agent workspace could not start.");
                }
            );
        return () => {
            cancelled = true;
        };
    }, [attempt]);
    useEffect(() => {
        if (!connection) return;
        const receive = (event: MessageEvent) => {
            if (event.origin !== connection.origin || event.source !== frameRef.current?.contentWindow) return;
            const message = event.data;
            if (!message || message.source !== "kronterm-openmausbot") return;
            if (message.type === "open-desktop" && typeof message.botId === "string") {
                if (pending.current) return;
                pending.current = true;
                setError("");
                void getApi()
                    .openBotDesktop(message.botId)
                    .then((desktop) => {
                        onClose();
                        getApi().switchWorkspace(desktop.workspaceId);
                    })
                    .catch((error) => {
                        setError(error instanceof Error ? error.message : "Bot desktop could not open.");
                    })
                    .finally(() => {
                        pending.current = false;
                    });
                return;
            }
            if (message.type === "cancel" && !pending.current) onClose();
            if (message.type !== "created" || created.current) return;
            const group = message.group;
            if (
                !group ||
                typeof group.id !== "string" ||
                !/^[a-zA-Z0-9_-]{1,128}$/.test(group.id) ||
                typeof group.name !== "string" ||
                group.name.length > 200
            )
                return;
            created.current = group;
            void saveGroup(group);
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    }, [connection, onClose, saveGroup]);
    const url = connection ? new URL(editing ? "/kronterm-app" : "/kronterm-setup", connection.origin) : undefined;
    if (url) {
        url.searchParams.set("parentOrigin", connection.parentOrigin);
        if (initialChannel?.upstreamGroupId) url.searchParams.set("group", initialChannel.upstreamGroupId);
    }
    return (
        <dialog
            ref={dialogRef}
            className={editing ? "os-upstream-agents is-app" : "os-upstream-agents"}
            aria-label={editing ? "Agent workspace" : "Create agent channel"}
            onCancel={(event) => {
                event.preventDefault();
                if (!pending.current) onClose();
            }}
        >
            {editing && (
                <button className="os-upstream-agents-close" type="button" onClick={onClose}>
                    Close agent workspace
                </button>
            )}
            {url && (
                <iframe
                    ref={frameRef}
                    src={url.href}
                    title={editing ? "Agent conversations and settings" : "Channel and bot creation"}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                    allow="microphone; clipboard-write"
                />
            )}
            {!connection && !error && (
                <div className="os-upstream-agents-state" role="status">
                    Starting agent workspace…
                </div>
            )}
            {error && (
                <div className="os-upstream-agents-state" role="alert">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            if (created.current) void saveGroup(created.current);
                            else setAttempt((value) => value + 1);
                        }}
                    >
                        Retry
                    </button>
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            )}
        </dialog>
    );
}
